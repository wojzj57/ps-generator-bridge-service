import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type Metadata } from "sharp";
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
const DEFAULT_IMPORT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_IMPORT_MAX_PIXELS = 100_000_000;
const DEFAULT_IMPORT_FORMATS = ["png", "jpeg", "webp", "gif", "tiff"] as const;
const OCTET_STREAM_TYPE = "application/octet-stream";
const FORMAT_EXTENSIONS: Record<string, string[]> = {
  png: [".png"],
  jpeg: [".jpg", ".jpeg"],
  webp: [".webp"],
  gif: [".gif"],
  tiff: [".tif", ".tiff"],
};
const CONTENT_TYPE_FORMATS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tiff",
  "image/tif": "tiff",
};

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
  declare public generatorSettings?: Record<string, unknown>;

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
    selection?: number;
    getChildren?: boolean;
    getGeneratorSettings?: boolean;
  }): Promise<PsLayer>;
  getLayerInfoByID(
    layerIDOrParams: number | { layerID: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer>;
  getLayerInfoByIndex(
    layerIndexOrParams: number | { layerIndex: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer>;
  getLayerInfoBySelectionIndex(
    selectionOrParams: number | { selection: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer>;
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
    selection?: number;
    getChildren?: boolean;
    getGeneratorSettings?: boolean;
  }): Promise<PsLayer> {
    return await this.jsx.executeSafe("Layer/getLayerInfo", {
      layerID: options?.id,
      layerIndex: options?.index,
      selection: options?.selection,
      getChildren: options?.getChildren,
      getGeneratorSettings: options?.getGeneratorSettings,
    });
  }

  @ws(ProtocolMethod.LayerGetInfoById)
  public getLayerInfoByID(
    layerIDOrParams: number | { layerID: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer> {
    const layerID = typeof layerIDOrParams === "number" ? layerIDOrParams : layerIDOrParams.layerID;
    const resolvedOptions =
      typeof layerIDOrParams === "number" ? undefined : layerIDOrParams.options;
    if (layerID == null) throw bridgeError.badRequest("Invalid layerID");
    return this.getLayerInfo({
      id: layerID,
      getChildren: resolvedOptions?.getChildren,
    });
  }

  @ws(ProtocolMethod.LayerGetInfoByIndex)
  public getLayerInfoByIndex(
    layerIndexOrParams: number | { layerIndex: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer> {
    const layerIndex =
      typeof layerIndexOrParams === "number" ? layerIndexOrParams : layerIndexOrParams.layerIndex;
    const resolvedOptions =
      typeof layerIndexOrParams === "number" ? undefined : layerIndexOrParams.options;
    if (layerIndex == null) throw bridgeError.badRequest("Invalid layerIndex");
    return this.getLayerInfo({
      index: layerIndex,
      getChildren: resolvedOptions?.getChildren,
    });
  }

  @ws(ProtocolMethod.LayerGetInfoBySelectionIndex)
  public getLayerInfoBySelectionIndex(
    selectionOrParams: number | { selection: number; options?: { getChildren: boolean } }
  ): Promise<PsLayer> {
    const selection =
      typeof selectionOrParams === "number" ? selectionOrParams : selectionOrParams.selection;
    const resolvedOptions =
      typeof selectionOrParams === "number" ? undefined : selectionOrParams.options;
    if (selection == null) throw bridgeError.badRequest("Invalid selection");
    return this.getLayerInfo({
      selection,
      getChildren: resolvedOptions?.getChildren,
    });
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
      let layerID = await this.jsx.executeSafe<number>("Layer/addImageLayer", {
        filePath: source.filePath,
        name: params.name,
        insertIndex,
      });
      if (!isPositiveNumber(layerID)) {
        layerID = await this.jsx.executeSafe<number>("Layer/getActiveLayerID");
      }
      if (!isPositiveNumber(layerID)) {
        throw bridgeError.jsxFailed("Image import did not return a layer id");
      }

      let layer = await this.getLayerInfoByID(layerID);
      const transformRect = this.resolveTransformRect(layer, params);
      if (transformRect) {
        await this.jsx.executeSafe("Layer/transformLayer", {
          id: layerID,
          position: {
            x: transformRect.x,
            y: transformRect.y,
          },
          size: {
            width: transformRect.width,
            height: transformRect.height,
          },
        });
        layer = await this.getLayerInfoByID(layerID);
      }

      if (params.useWorkpath) {
        await this.jsx.executeSafe("Layer/setLayerWorkpathMask", {
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
    const config = this.importImageConfig();
    const value = image.trim();
    if (DATA_URI_PATTERN.test(value)) {
      const match = value.match(DATA_URI_PATTERN);
      const metadata = match?.[1] ?? "";
      const body = match?.[2] ?? "";
      this.assertAllowedContentType(metadata);
      const buffer = metadata.toLowerCase().includes(";base64")
        ? Buffer.from(body.replace(/\s/g, ""), "base64")
        : Buffer.from(decodeURIComponent(body), "utf8");
      return this.writeTempImportImage(buffer, config);
    }

    if (HTTP_URI_PATTERN.test(value)) {
      return this.downloadImportImage(value, config);
    }

    if (FILE_URI_PATTERN.test(value)) {
      this.assertLocalImagePathsAllowed(config);
      const filePath = value.toLowerCase().startsWith("file://")
        ? fileURLToPath(value)
        : decodeURIComponent(value.slice("file:".length));
      await this.validateLocalImageFile(filePath, config);
      return { filePath };
    }

    if (await pathExists(value)) {
      this.assertLocalImagePathsAllowed(config);
      await this.validateLocalImageFile(value, config);
      return { filePath: value };
    }

    const compact = value.replace(/\s/g, "");
    if (!compact || !BASE64_PATTERN.test(compact)) {
      throw bridgeError.badRequest(
        "image must be a data URI, URL, file URI, local path, or base64"
      );
    }
    return this.writeTempImportImage(Buffer.from(compact, "base64"), config);
  }

  private async downloadImportImage(
    url: string,
    config: ImportImageConfig
  ): Promise<ImportImageSource> {
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
    this.assertAllowedContentType(response.headers.get("content-type"));
    this.assertAllowedContentLength(response.headers.get("content-length"), config);
    const buffer = await readResponseBuffer(response, config.maxBytes);
    return this.writeTempImportImage(buffer, config);
  }

  private async writeTempImportImage(
    buffer: Buffer,
    config: ImportImageConfig
  ): Promise<ImportImageSource> {
    this.assertBufferWithinLimit(buffer, config);
    const format = await this.validateImageMetadata(buffer, config);
    const dir = await mkdtemp(join(tmpdir(), "ps-bridge-import-"));
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const filePath = join(dir, `${hash}${extensionForFormat(format)}`);
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

  private async validateLocalImageFile(filePath: string, config: ImportImageConfig): Promise<void> {
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(filePath);
    } catch {
      throw bridgeError.badRequest("image file does not exist");
    }
    if (!stats.isFile()) throw bridgeError.badRequest("image path must point to a file");
    if (stats.size > config.maxBytes) throw imageTooLarge(config.maxBytes);

    const extension = extname(filePath).toLowerCase();
    if (!isAllowedExtension(extension, config)) {
      throw bridgeError.badRequest("image file extension is not allowed");
    }
    await this.validateImageMetadata(filePath, config);
  }

  private assertBufferWithinLimit(buffer: Buffer, config: ImportImageConfig): void {
    if (buffer.length === 0) throw bridgeError.badRequest("image data is empty");
    if (buffer.length > config.maxBytes) throw imageTooLarge(config.maxBytes);
  }

  private async validateImageMetadata(
    input: Buffer | string,
    config: ImportImageConfig
  ): Promise<string> {
    let metadata: Metadata;
    try {
      metadata = await sharp(input, { limitInputPixels: config.maxPixels }).metadata();
    } catch {
      throw bridgeError.badRequest("image data is not a supported image format");
    }
    const format = normalizeFormat(metadata.format);
    if (!format || !config.allowedFormats.has(format)) {
      throw bridgeError.badRequest("image data is not a supported image format");
    }
    const width = metadata.width;
    const height = metadata.height;
    if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
      throw bridgeError.badRequest("image data is not a supported image format");
    }
    if (width * height > config.maxPixels) {
      throw bridgeError.badRequest(`image exceeds max pixel count of ${config.maxPixels}`);
    }
    return format;
  }

  private assertAllowedContentType(contentType: string | null | undefined): void {
    const format = formatFromContentType(contentType);
    if (format === undefined) return;
    if (!this.importImageConfig().allowedFormats.has(format)) {
      throw bridgeError.badRequest("image content-type is not allowed");
    }
  }

  private assertAllowedContentLength(
    contentLength: string | null | undefined,
    config: ImportImageConfig
  ): void {
    if (!contentLength) return;
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > config.maxBytes) throw imageTooLarge(config.maxBytes);
  }

  private assertLocalImagePathsAllowed(config: ImportImageConfig): void {
    if (!config.allowLocalPaths) throw bridgeError.badRequest("local image paths are disabled");
  }

  private importImageConfig(): ImportImageConfig {
    const configuredFormats = this.plugin.config.allowedImportImageFormats;
    const allowedFormats =
      Array.isArray(configuredFormats) && configuredFormats.length > 0
        ? new Set(configuredFormats.map(normalizeFormat).filter(isString))
        : new Set<string>(DEFAULT_IMPORT_FORMATS);
    return {
      maxBytes: positiveConfigNumber(
        this.plugin.config.maxImportImageBytes,
        DEFAULT_IMPORT_MAX_BYTES
      ),
      maxPixels: positiveConfigNumber(
        this.plugin.config.maxImportImagePixels,
        DEFAULT_IMPORT_MAX_PIXELS
      ),
      allowedFormats,
      allowLocalPaths: this.plugin.config.allowLocalImagePaths !== false,
    };
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
      this.currentLayer = await this.getLayerInfoBySelectionIndex(index);
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
    for (const selectedIndex of selection) {
      try {
        layers.push(await this.getLayerInfoBySelectionIndex(selectedIndex));
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

interface ImportImageConfig {
  maxBytes: number;
  maxPixels: number;
  allowedFormats: Set<string>;
  allowLocalPaths: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function positiveConfigNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeFormat(format: unknown): string | undefined {
  if (typeof format !== "string") return undefined;
  const normalized = format.trim().toLowerCase();
  if (normalized === "jpg") return "jpeg";
  if (normalized === "tif") return "tiff";
  return normalized || undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isAllowedExtension(extension: string, config: ImportImageConfig): boolean {
  return [...config.allowedFormats].some((format) =>
    (FORMAT_EXTENSIONS[format] ?? []).includes(extension)
  );
}

function extensionForFormat(format: string): string {
  return FORMAT_EXTENSIONS[format]?.[0] ?? ".png";
}

function formatFromContentType(contentType: string | null | undefined): string | undefined {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized || normalized === OCTET_STREAM_TYPE) return undefined;
  return CONTENT_TYPE_FORMATS[normalized] ?? "__unsupported__";
}

function imageTooLarge(maxBytes: number): Error {
  return bridgeError.badRequest(`image exceeds max size of ${formatBytes(maxBytes)}`);
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${bytes} bytes`;
}

async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw imageTooLarge(maxBytes);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw imageTooLarge(maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}
