import { ProtocolMethod, type MethodName, type ProtocolMethods } from "../protocol";
import type { PsJsxRunner } from "../photoshop";

export type Invoker = <M extends MethodName>(
  method: M,
  params: ProtocolMethods[M]["params"]
) => Promise<ProtocolMethods[M]["result"]>;

export class PublicJsxRunner implements PsJsxRunner {
  constructor(private readonly invoke: Invoker) {}

  run<T = unknown>(script: string): Promise<T> {
    return this.invoke(ProtocolMethod.JsxRun, { script }) as Promise<T>;
  }

  execute<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T> {
    return this.invoke(ProtocolMethod.JsxExecute, { name, params }) as Promise<T>;
  }
}

export class PublicModules {
  readonly layer = {
    getLayerInfo: (params?: ProtocolMethods[typeof ProtocolMethod.LayerGetInfo]["params"]) =>
      this.invoke(ProtocolMethod.LayerGetInfo, params),
    getLayerInfoByID: (layerID: number, options?: { getChildren: boolean }) =>
      this.invoke(ProtocolMethod.LayerGetInfoById, { layerID, options }),
    getLayerInfoByIndex: (layerIndex: number, options?: { getChildren: boolean }) =>
      this.invoke(ProtocolMethod.LayerGetInfoByIndex, { layerIndex, options }),
    getCurrentPreview: () => this.invoke(ProtocolMethod.LayerGetCurrentPreview, {}),
    importImage: (params: ProtocolMethods[typeof ProtocolMethod.LayerImportImage]["params"]) =>
      this.invoke(ProtocolMethod.LayerImportImage, params),
  };

  readonly document = {
    getCurrentDocument: () => this.invoke(ProtocolMethod.DocumentCurrent, {}),
    exportDocument: (params: ProtocolMethods[typeof ProtocolMethod.DocumentExport]["params"]) =>
      this.invoke(ProtocolMethod.DocumentExport, params),
    saveDocument: (params: ProtocolMethods[typeof ProtocolMethod.DocumentSave]["params"]) =>
      this.invoke(ProtocolMethod.DocumentSave, params),
  };

  readonly action = {
    autoCutout: () => this.invoke(ProtocolMethod.ActionAutoCutout, {}),
    removeBackground: () => this.invoke(ProtocolMethod.ActionRemoveBackground, {}),
  };

  readonly image = {
    exportLayer: (params: ProtocolMethods[typeof ProtocolMethod.ImageExportLayer]["params"]) =>
      this.invoke(ProtocolMethod.ImageExportLayer, params),
    exportLayerWithSelectedPath: (
      params: ProtocolMethods[typeof ProtocolMethod.ImageExportLayerWithSelectedPath]["params"]
    ) => this.invoke(ProtocolMethod.ImageExportLayerWithSelectedPath, params),
    getPreview: (params: ProtocolMethods[typeof ProtocolMethod.ImageGetPreview]["params"]) =>
      this.invoke(ProtocolMethod.ImageGetPreview, params),
    exportDocument: (
      params: ProtocolMethods[typeof ProtocolMethod.ImageExportDocument]["params"]
    ) => this.invoke(ProtocolMethod.ImageExportDocument, params),
  };

  readonly selection = {
    watch: () => this.invoke(ProtocolMethod.SelectionWatch, {}),
    getArea: () => this.invoke(ProtocolMethod.SelectionGetArea, {}),
    getPath: (params?: ProtocolMethods[typeof ProtocolMethod.SelectionGetPath]["params"]) =>
      this.invoke(ProtocolMethod.SelectionGetPath, params),
  };

  constructor(private readonly invoke: Invoker) {}
}
