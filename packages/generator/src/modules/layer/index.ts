import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { ws } from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";
import type { PsBounds, PsRect } from "../../types/ps";
import { bridgeError } from "../../errors";

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
}

export class LayerModule extends BaseModule implements LayerModuleApi {
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
}
