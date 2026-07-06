import {
  MainEvent,
  ProtocolMethod,
  type ImageChangedEvent,
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

export type { LayerPreviewPayload };
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