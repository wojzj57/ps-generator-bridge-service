import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MainEvent,
  ProtocolMethod,
  type ImageChangedEvent,
  type LayerImportImageParams,
  type LayerPreviewPayload,
  type LayerSelectionChangePayload,
} from "@ps-generator-bridge/sdk";
import {
  subscribable,
  useLogger,
  ws,
  type SubscribableContext,
} from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";
import type { PsBounds, PsRect } from "../../types/ps";
import { bridgeError } from "../../errors";

const log = useLogger("layer");
const PREVIEW_CHANGE_DEBOUNCE_MS = 300;
const DATA_URI_PATTERN = /^data:([^,]*),(.*)$/is;
const HTTP_URI_PATTERN = /^https?:/i;
const FILE_URI_PATTERN = /^file:/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

export type { LayerImportImageParams, LayerPreviewPayload };
export type { LayerSelectionChangePayload };

export class PsLayer {
  declare public id: number;
  declare public index: number;
  declare public name: string;
  declare public type: number;
  declare public visible: boolean;
  declare public bounds: PsBounds;
  declare public rect: PsRect;
  declare public clip: boolean;
  declare public children?: PsLayer[];
  // public declare generatorSettings?: { [key: string]: any };

  constructor(init: Partial<PsLayer>) {
    Object.assign(this, init);
  }
}
namespace LayerModule {
  export type LayerPixelOptions = {
    resolution?: number;
  };
  export interface onImageChangedParams {
    count: number;
    id: number;
    metaDataOnly: boolean;
    layers: {
      id: number;
      bounds: PsBounds;
      pixels: boolean;
      removed?: boolean;
    }[];
    selection: number[];
    timeStamp: number;
    version: string;
  }
}

/**
 * The Layer module surface a Plugin reaches through `plugin.modules.layer`
 * (RFC 0003). `LayerModule implements` this, so the plugin contract tracks the
 * implementation by compiler force; the SDK re-exports it via src/contract.ts.
 */
export interface LayerModuleApi {
  getLayerInfo(options?: {
    id?: number;
    index?: number;
    getChildren?: boolean;
    getGeneratorSettings?: boolean;
  }): Promise<PsLayer>;
  getLayerInfoByID(layerID: number, options?: { getChildren: boolean }): Promise<PsLayer>;
  getLayerInfoByIndex(layerIndex: number, options?: { getChildren: boolean }): Promise<PsLayer>;
  getCurrentPreview(): Promise<LayerPreviewPayload>;
  importImage(params: LayerImportImageParams): Promise<PsLayer>;
}

export class LayerModule extends BaseModule implements LayerModuleApi {
  private previewCache: LayerPreviewPayload = null;
  private currentLayer: PsLayer | undefined;
  private previewChangeTimer: ReturnType<typeof setTimeout> | undefined;
  private previewRefreshInFlight = false;
  private previewRefreshPending = false;

  constructor(plugin: PsBridgeHost) {
    super("layer", plugin);
  }

  @ws(ProtocolMethod.LayerGetInfo)
  public async getLayerInfo(options?: {
    id?: number;
    index?: number;
    getChildren?: boolean;
    getGeneratorSettings?: boolean;
  }): Promise<PsLayer> {
    return await this.plugin.jsx.executeSafe("Layer/getLayerInfo", {
      layerID: options?.id,
      layerIndex: options?.index,
      getChildren: options?.getChildren,
      getGeneratorSettings: options?.getGeneratorSettings,
    });
  }

  @ws(ProtocolMethod.LayerGetInfoById)
  public getLayerInfoByID(
    layerIDOrParams: number | { layerID: number; options?: { getChildren: boolean } },
    options?: {
      getChildren: boolean;
    }
  ): Promise<PsLayer> {
    const layerID = typeof layerIDOrParams === "number" ? layerIDOrParams : layerIDOrParams.layerID;
    const resolvedOptions = typeof layerIDOrParams === "number" ? options : layerIDOrParams.options;
    if (layerID == null) throw bridgeError.badRequest("Invalid layerID");
    const params = {
      layerID: layerID,
      getChildren: resolvedOptions?.getChildren,
    };
    return this.plugin.jsx.executeSafe("Layer/getLayerInfo", params);
  }

  @ws(ProtocolMethod.LayerGetInfoByIndex)
  public getLayerInfoByIndex(
    layerIndexOrParams: number | { layerIndex: number; options?: { getChildren: boolean } },
    options?: {
      getChildren: boolean;
    }
  ): Promise<PsLayer> {
    const layerIndex =
      typeof layerIndexOrParams === "number" ? layerIndexOrParams : layerIndexOrParams.layerIndex;
    const resolvedOptions =
      typeof layerIndexOrParams === "number" ? options : layerIndexOrParams.options;
    if (layerIndex == null) throw bridgeError.badRequest("Invalid layerIndex");
    // 明确定义参数类型
    const params = {
      layerIndex,
      getChildren: resolvedOptions?.getChildren,
    };
    return this.plugin.jsx.executeSafe("Layer/getLayerInfo", params);
  }

  @ws(ProtocolMethod.LayerGetCurrentPreview)
  public async getCurrentPreview(): Promise<LayerPreviewPayload> {
    try {
      const layer = await this.getLayerInfo();
      this.currentLayer = layer;
      return await this.refreshPreviewForLayer(layer);
    } catch (error) {
      log.warn("current layer preview generation failed", error);
      this.previewCache = null;
      return null;
    }
  }

  @ws(ProtocolMethod.LayerImportImage)
  public async importImage(params: LayerImportImageParams): Promise<PsLayer> {
    this.validateImportImageParams(params);
    const source = await this.resolveImportImageSource(params.image);
    try {
      const insertIndex = await this.resolveImportInsertIndex(params);
      let layerID = await this.plugin.jsx.executeSafe<number>("Layer/addImageLayer", {
        filePath: source.filePath,
        name: params.name,
        insertIndex,
      });
      if (!isPositiveNumber(layerID)) {
        layerID = await this.plugin.jsx.executeSafe<number>("Layer/getActiveLayerID");
      }
      if (!isPositiveNumber(layerID)) {
        throw bridgeError.jsxFailed("Image import did not return a layer id");
      }

      let layer = await this.getLayerInfoByID(layerID);
      const transformRect = this.resolveTransformRect(layer, params);
      if (transformRect) {
        await this.plugin.jsx.executeSafe("Layer/transformLayer", {
          id: layerID,
          rect: transformRect,
        });
        layer = await this.getLayerInfoByID(layerID);
      }

      if (params.useWorkpath) {
        await this.plugin.jsx.executeSafe("Layer/setLayerWorkpathMask", {
          id: layerID,
          blur: 10,
        });
        layer = await this.getLayerInfoByID(layerID);
      }

      return layer;
    } finally {
      await source.cleanup?.();
    }
  }

  private validateImportImageParams(params: LayerImportImageParams): void {
    if (!params || typeof params.image !== "string" || params.image.trim() === "") {
      throw bridgeError.badRequest("image is required");
    }
    if (params.layerId != null && params.layerIndex != null) {
      throw bridgeError.badRequest("layerId and layerIndex are mutually exclusive");
    }
    if (params.layerId != null && !isPositiveNumber(params.layerId)) {
      throw bridgeError.badRequest("layerId must be a positive number");
    }
    if (params.layerIndex != null && !isFiniteNumber(params.layerIndex)) {
      throw bridgeError.badRequest("layerIndex must be a number");
    }
    if (params.position) {
      if (!isFiniteNumber(params.position.x) || !isFiniteNumber(params.position.y)) {
        throw bridgeError.badRequest("position must contain finite x and y values");
      }
    }
    if (params.size) {
      if (!isPositiveNumber(params.size.width) || !isPositiveNumber(params.size.height)) {
        throw bridgeError.badRequest("size must contain positive width and height values");
      }
    }
  }

  private async resolveImportImageSource(image: string): Promise<ImportImageSource> {
    const value = image.trim();
    if (DATA_URI_PATTERN.test(value)) {
      const match = value.match(DATA_URI_PATTERN);
      const metadata = match?.[1] ?? "";
      const body = match?.[2] ?? "";
      const buffer = metadata.toLowerCase().includes(";base64")
        ? Buffer.from(body.replace(/\s/g, ""), "base64")
        : Buffer.from(decodeURIComponent(body), "utf8");
      return this.writeTempImportImage(buffer, extensionFromDataMetadata(metadata));
    }

    if (HTTP_URI_PATTERN.test(value)) {
      return this.downloadImportImage(value);
    }

    if (FILE_URI_PATTERN.test(value)) {
      const filePath = value.toLowerCase().startsWith("file://")
        ? fileURLToPath(value)
        : decodeURIComponent(value.slice("file:".length));
      this.assertExistingImportFile(filePath);
      return { filePath };
    }

    if (existsSync(value)) {
      return { filePath: value };
    }

    const compact = value.replace(/\s/g, "");
    if (!compact || !BASE64_PATTERN.test(compact)) {
      throw bridgeError.badRequest(
        "image must be a data URI, URL, file URI, local path, or base64"
      );
    }
    return this.writeTempImportImage(Buffer.from(compact, "base64"), ".png");
  }

  private async downloadImportImage(url: string): Promise<ImportImageSource> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw bridgeError.badRequest(`image URL request failed: ${message}`, { url });
    }
    if (!response.ok) {
      throw bridgeError.badRequest(`image URL request failed with status ${response.status}`, {
        url,
        status: response.status,
      });
    }
    const contentType = response.headers.get("content-type") ?? undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.writeTempImportImage(
      buffer,
      extensionFromUrl(url) ?? extensionFromMime(contentType)
    );
  }

  private async writeTempImportImage(
    buffer: Buffer,
    extension = ".png"
  ): Promise<ImportImageSource> {
    if (buffer.length === 0) throw bridgeError.badRequest("image data is empty");
    const dir = await mkdtemp(join(tmpdir(), "ps-bridge-import-"));
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const filePath = join(dir, `${hash}${normalizeExtension(extension)}`);
    await writeFile(filePath, buffer);
    return {
      filePath,
      cleanup: async () => {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch (error) {
          log.warn("temporary import image cleanup failed", error);
        }
      },
    };
  }

  private assertExistingImportFile(filePath: string): void {
    if (!existsSync(filePath)) {
      throw bridgeError.badRequest(`image file does not exist: ${filePath}`);
    }
  }

  private async resolveImportInsertIndex(
    params: LayerImportImageParams
  ): Promise<number | undefined> {
    if (params.layerIndex != null) return params.layerIndex + 1;
    if (params.layerId == null) return undefined;
    const layer = await this.getLayerInfoByID(params.layerId);
    return layer.index + 1;
  }

  private resolveTransformRect(layer: PsLayer, params: LayerImportImageParams): PsRect | undefined {
    if (!params.position && !params.size) return undefined;
    const rect = layer.rect;
    if (!rect) throw bridgeError.jsxFailed("Imported layer bounds are unavailable");
    return {
      x: params.position?.x ?? rect.x,
      y: params.position?.y ?? rect.y,
      width: params.size?.width ?? rect.width,
      height: params.size?.height ?? rect.height,
    };
  }

  @subscribable(MainEvent.LayerPreviewChange)
  private layerPreviewChangeProducer(
    context: SubscribableContext<LayerPreviewPayload>
  ): () => void {
    const onImageChanged = (event: ImageChangedEvent): void => {
      this.handleImageChanged(event, context.emit);
    };
    this.plugin.events.on("imageChanged", onImageChanged);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.plugin.events.off("imageChanged", onImageChanged);
      this.clearPreviewChangeTimer();
      this.previewRefreshPending = false;
      this.previewRefreshInFlight = false;
    };
  }

  @subscribable(MainEvent.LayerSelectionChange)
  private layerSelectionChangeProducer(
    context: SubscribableContext<LayerSelectionChangePayload>
  ): () => void {
    const onImageChanged = (event: ImageChangedEvent): void => {
      if (!Array.isArray(event.selection)) return;
      void this.emitLayerSelectionChange(event.selection, context.emit);
    };
    this.plugin.events.on("imageChanged", onImageChanged);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.plugin.events.off("imageChanged", onImageChanged);
    };
  }

  private handleImageChanged(
    event: ImageChangedEvent,
    emit: (payload: LayerPreviewPayload) => void
  ): void {
    if (event.selection) {
      void this.handleSelectionChange(event.selection, emit);
      return;
    }
    if (event.layers?.some((layer) => layer.pixels)) {
      void this.handlePixelChange(event, emit);
    }
  }

  private async handleSelectionChange(
    selection: number[],
    emit: (payload: LayerPreviewPayload) => void
  ): Promise<void> {
    const index = selection[0];
    if (index === undefined) {
      this.currentLayer = undefined;
      this.previewCache = null;
      this.schedulePreviewChange(emit);
      return;
    }

    try {
      this.currentLayer = await this.getLayerInfoByIndex(index);
    } catch (error) {
      log.warn("selected layer lookup failed", error);
      this.currentLayer = undefined;
      this.previewCache = null;
    }
    this.schedulePreviewChange(emit);
  }

  private async emitLayerSelectionChange(
    selection: number[],
    emit: (payload: LayerSelectionChangePayload) => void
  ): Promise<void> {
    if (selection.length === 0) {
      emit(null);
      return;
    }

    const layers: PsLayer[] = [];
    for (const layerIndex of selection) {
      try {
        layers.push(
          await this.plugin.jsx.executeSafe<PsLayer>("Layer/getLayerInfo", {
            layerIndex,
          })
        );
      } catch (error) {
        log.warn("selected layer lookup failed", error);
      }
    }
    emit(layers);
  }

  private async handlePixelChange(
    event: ImageChangedEvent,
    emit: (payload: LayerPreviewPayload) => void
  ): Promise<void> {
    const touchedLayerIds = new Set(
      event.layers?.filter((layer) => layer.pixels).map((layer) => layer.id) ?? []
    );
    if (touchedLayerIds.size === 0) return;

    const current = this.currentLayer ?? (await this.resolveCurrentLayer());
    if (!current || !touchedLayerIds.has(current.id)) return;

    this.currentLayer = current;
    this.schedulePreviewChange(emit);
  }

  private async resolveCurrentLayer(): Promise<PsLayer | undefined> {
    try {
      return await this.getLayerInfo();
    } catch (error) {
      log.warn("current layer lookup failed", error);
      this.previewCache = null;
      return undefined;
    }
  }

  private schedulePreviewChange(emit: (payload: LayerPreviewPayload) => void): void {
    this.clearPreviewChangeTimer();
    this.previewChangeTimer = setTimeout(() => {
      void this.emitPreviewChange(emit);
    }, PREVIEW_CHANGE_DEBOUNCE_MS);
  }

  private clearPreviewChangeTimer(): void {
    if (!this.previewChangeTimer) return;
    clearTimeout(this.previewChangeTimer);
    this.previewChangeTimer = undefined;
  }

  private async emitPreviewChange(emit: (payload: LayerPreviewPayload) => void): Promise<void> {
    this.previewChangeTimer = undefined;
    if (this.previewRefreshInFlight) {
      this.previewRefreshPending = true;
      return;
    }

    this.previewRefreshInFlight = true;
    try {
      const preview = await this.refreshCurrentLayerPreview();
      emit(preview);
    } finally {
      this.previewRefreshInFlight = false;
      if (this.previewRefreshPending) {
        this.previewRefreshPending = false;
        this.schedulePreviewChange(emit);
      }
    }
  }

  private async refreshCurrentLayerPreview(): Promise<LayerPreviewPayload> {
    if (!this.currentLayer) {
      this.previewCache = null;
      return null;
    }
    return this.refreshPreviewForLayer(this.currentLayer);
  }

  private async refreshPreviewForLayer(layer: PsLayer): Promise<LayerPreviewPayload> {
    if (isEmptyLayer(layer)) {
      this.previewCache = null;
      return null;
    }

    try {
      const result = await this.plugin.modules.image.getPreview({ layerSpec: layer.id });
      const preview = {
        id: layer.id,
        name: layer.name,
        index: layer.index,
        width: result.width,
        height: result.height,
        data: "data:image/png;base64," + Buffer.from(result.buffer).toString("base64"),
      };
      this.previewCache = preview;
      return preview;
    } catch (error) {
      log.warn("layer preview generation failed", error);
      this.previewCache = null;
      return null;
    }
  }
}

function isEmptyLayer(layer: PsLayer): boolean {
  const rect = layer.rect;
  return !rect || rect.width <= 0 || rect.height <= 0;
}

interface ImportImageSource {
  filePath: string;
  cleanup?: () => Promise<void>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function extensionFromDataMetadata(metadata: string): string {
  const mime = metadata.split(";")[0];
  return extensionFromMime(mime);
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const extension = extname(new URL(url).pathname);
    return extension || undefined;
  } catch {
    return undefined;
  }
}

function extensionFromMime(mime: string | undefined): string {
  const normalized = mime?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/tiff") return ".tif";
  return ".png";
}

function normalizeExtension(extension: string): string {
  if (!extension) return ".png";
  return extension.startsWith(".") ? extension : `.${extension}`;
}
