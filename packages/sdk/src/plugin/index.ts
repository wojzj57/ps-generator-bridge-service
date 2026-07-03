// Plugin devkit subpath (RFC 0003). Exported from `@ps-generator-bridge/sdk/plugin`.
// The package root (`@ps-generator-bridge/sdk`) stays browser-safe; this subpath
// holds the server-side Plugin authoring surface (BasePlugin, decorators,
// PluginHost) that third-party Plugins depend on without touching the server
// package at runtime.
//
// Type contract direction (RFC 0003 revision): the generator is the single
// source of truth for the module / jsx / event shapes a Plugin sees. The runtime
// authoring primitives (BasePlugin, ws, api, bootstrap) live here in the SDK so a
// plugin's `require` stays lightweight; the *types* are re-exported (type-only,
// inlined into this package's `.d.ts` at build) from the generator's contract
// barrel. Runtime arrow: generator -> sdk. Type arrow: sdk -> generator. They
// never meet at runtime, so there is no cycle.

// Runtime authoring kit (stays in the SDK).
export { BasePlugin, isBasePluginClass } from "./base";
export { ws, api, bootstrap } from "./decorators";

// The one hand-written curation of the host (its member types come from the
// generator contract).
export type { PluginHost } from "./host";

// Module / jsx / event / domain types — re-exported verbatim from the generator
// contract so the plugin surface tracks the implementation by compiler force.
export type {
  JsxRunnerApi,
  LayerModuleApi,
  DocumentModuleApi,
  ActionModuleApi,
  ImageModuleApi,
  CosServiceApi,
  PsLayer,
  PsDocument,
  ImageResult,
  LayerSpec,
  PsBounds,
  PsRect,
  PhotoshopEvents,
  PluginEvents,
  PhotoshopEventMap,
  PhotoshopEventListener,
  ImageChangedEvent,
  ImageChangedLayer,
  Bounds,
} from "@ps-generator-bridge/generator/contract";

export type { AssemblyTarget, MethodHandler, ApiHandler, ApiRouteSpec, HttpMethod } from "./types";

// Photoshop DOM proxy reached through `this.photoshop` on a plugin. The proxy
// classes are exported as types only (authors get instances from the base
// class, never construct them). `PsColor` is the foreground-color DTO; the
// proxy's tuple bounds is re-exported as `PsBoundsTuple` to avoid clashing with
// the contract's object-shaped `PsBounds` above.
export type {
  PsPhotoshopProxy,
  PhotoshopApp,
  PhotoshopDocument,
  PhotoshopLayer,
  PhotoshopLayers,
  PhotoshopSelection,
  PsColor,
  PsBounds as PsBoundsTuple,
} from "../photoshop";
export {
  SaveOptions,
  type SaveOptionsValue,
  LayerKind,
  type LayerKindValue,
  BlendMode,
  type BlendModeValue,
  ElementPlacement,
  type ElementPlacementValue,
  AnchorPosition,
  type AnchorPositionValue,
  DocumentMode,
  type DocumentModeValue,
  SelectionType,
  type SelectionTypeValue,
} from "../photoshop";
