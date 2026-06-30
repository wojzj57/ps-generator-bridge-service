// Plugin-facing contract barrel. This is the ONLY generator surface the SDK
// reaches into: the SDK's `/plugin` subpath re-exports these types (resolved
// through a path alias and inlined into the SDK's published `.d.ts`), so plugins
// get the real generator shapes without depending on the server package at
// runtime. Keep this file free of server/host internals (PsBridgeHost, the
// server, fastify) so the SDK's type graph stays small and Node-free.
//
// Re-export `type`-only: nothing here carries a runtime value across the
// boundary (the SDK imports it all with `import type`).

export type { LayerModuleApi, PsLayer } from "./modules/layer";
export type { DocumentModuleApi, PsDocument } from "./modules/document";
export type { ActionModuleApi } from "./modules/action";
export type { ImageModuleApi, ImageResult, LayerSpec } from "./modules/image";
export type { CosServiceApi } from "./services/cos";
export type { JsxRunnerApi } from "./utilis/jsxRunner";
export type {
  PhotoshopEvents,
  PhotoshopEventMap,
  PhotoshopEventListener,
  ImageChangedEvent,
  ImageChangedLayer,
  Bounds,
} from "./utilis/eventManager";
export type { PsBounds, PsRect } from "./types/ps";
