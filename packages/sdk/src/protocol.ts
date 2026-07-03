/**
 * The wire contract shared by the SDK client and the server.
 *
 * This package is the single source of truth for the protocol (ADR 0001): the
 * server depends on this module type-only and implements the same shapes. To add
 * a server capability, model it here first (a new entry in `ProtocolMethods`),
 * then implement it on the server and expose a method on the client.
 */

/** Bumped on any breaking change to the envelope or method shapes. */
export const PROTOCOL_VERSION = 1;

/**
 * Request method names shared by the sdk type surface and generator registration.
 * Keep new built-in/module Request names here first, then reference these
 * constants from server decorators so the Protocol remains the source of truth.
 */
export const ProtocolMethod = {
  GetServerInfo: "getServerInfo",
  JsxRun: "jsx:run",
  JsxExecute: "jsx:execute",
  EventSubscribe: "event:subscribe",
  EventUnsubscribe: "event:unsubscribe",
  ActionAutoCutout: "action:autoCutout",
  ActionRemoveBackground: "action:removeBackground",
  LayerGetInfo: "layer:getInfo",
  LayerGetInfoById: "layer:getInfoById",
  LayerGetInfoByIndex: "layer:getInfoByIndex",
  DocumentCurrent: "document:current",
  DocumentExport: "document:export",
  DocumentSave: "document:save",
  ImageExportLayer: "image:exportLayer",
  ImageGetPreview: "image:getPreview",
  ImageExportDocument: "image:exportDocument",
} as const;
export type ProtocolMethod = (typeof ProtocolMethod)[keyof typeof ProtocolMethod];

/** Every method the server exposes, keyed by name -> { params, result }. */
export interface ProtocolMethods {
  [ProtocolMethod.GetServerInfo]: {
    params: Record<string, never>;
    result: ServerInfo;
  };
  [ProtocolMethod.JsxRun]: {
    params: { script: string };
    result: unknown;
  };
  [ProtocolMethod.JsxExecute]: {
    params: { name: string; params?: Record<string, unknown> };
    result: unknown;
  };
  [ProtocolMethod.EventSubscribe]: {
    params: { type: SubscribableEventName };
    result: { ok: true };
  };
  [ProtocolMethod.EventUnsubscribe]: {
    params: { type: SubscribableEventName };
    result: { ok: true };
  };
  // Feature-module methods (ADR 0006). The `Domain:action` namespace mirrors the
  // packaged jsx layout (`jsx/Action/<name>.jsx`) and keeps module methods from
  // colliding with built-ins as Document/Layer land. Plugin-specific methods
  // (e.g. SidePaint:*) are NOT declared here — a plugin ships its own method type
  // table with its package; callers reach them via the open
  // `Connection.invoke(method: string, params?)` overload or a plugin wrapper.
  [ProtocolMethod.ActionAutoCutout]: {
    params: Record<string, never>;
    result: boolean;
  };
  [ProtocolMethod.ActionRemoveBackground]: {
    params: Record<string, never>;
    result: { success: boolean };
  };
  [ProtocolMethod.LayerGetInfo]: {
    params?: {
      id?: number;
      index?: number;
      getChildren?: boolean;
      getGeneratorSettings?: boolean;
    };
    result: PsLayer;
  };
  [ProtocolMethod.LayerGetInfoById]: {
    params: { layerID: number; options?: { getChildren: boolean } };
    result: PsLayer;
  };
  [ProtocolMethod.LayerGetInfoByIndex]: {
    params: { layerIndex: number; options?: { getChildren: boolean } };
    result: PsLayer;
  };
  [ProtocolMethod.DocumentCurrent]: {
    params: Record<string, never>;
    result: PsDocument;
  };
  [ProtocolMethod.DocumentExport]: {
    params: { filePath: string } & Record<string, unknown>;
    result: unknown;
  };
  [ProtocolMethod.DocumentSave]: {
    params: { savePath?: string };
    result: unknown;
  };
  // Image module methods (RFC 0008). These return a wire-friendly
  // `WsImageResult` (a `data` string, not raw PNG bytes) so they cross the JSON
  // WS protocol cleanly — unlike the module-internal `ImageResult`, whose
  // `buffer` JSON-serializes to garbage. `settings` is widened to
  // `Record<string, unknown>` so the contract does not drag generator-core's
  // `GetPixmapSettings` namespace across the boundary.
  [ProtocolMethod.ImageExportLayer]: {
    params: { documentId?: number; layerSpec: LayerSpec; settings?: Record<string, unknown> };
    result: WsImageResult;
  };
  [ProtocolMethod.ImageGetPreview]: {
    params: { documentId?: number; layerSpec: number };
    result: WsImageResult;
  };
  [ProtocolMethod.ImageExportDocument]: {
    params: { documentId?: number; settings?: Record<string, unknown> };
    result: WsImageResult;
  };
}

export type MethodName = keyof ProtocolMethods;

/**
 * A layer spec: either a layer id, or an index range plus the indices of layers
 * to hide (the form Photoshop's `getLayerPixmap.jsx` accepts). Modeled here as a
 * wire type (RFC 0008) so the protocol is self-contained; the generator's image
 * module re-exports it for its plugin-facing API.
 */
export type LayerSpec =
  | number
  | { firstLayerIndex: number; lastLayerIndex: number; hidden: number[] };

export interface PsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PsLayer {
  id: number;
  index: number;
  name: string;
  type: number;
  visible: boolean;
  bounds: PsBounds;
  rect: PsRect;
  clip: boolean;
  children?: PsLayer[];
}

export interface PsDocument {
  id: number;
  name: string;
  width: number;
  height: number;
  resolution: number;
  isDirty: boolean;
  filePath?: string;
}

/**
 * The result of an image `@ws` method (RFC 0008). `data` is an out-of-the-box
 * image string the client can drop straight into an `<img src>`:
 * `data:image/png;base64,...` when inlined, or `https://...` when a `CosService`
 * uploaded it. The client tells them apart by the `data`/`http` prefix — there
 * is deliberately no separate discriminator field. `bounds`/`width`/`height`
 * carry the same geometry as the module-internal `ImageResult`.
 */
export interface WsImageResult {
  data: string;
  bounds: PsBounds;
  width: number;
  height: number;
}

export interface PsBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  /** Photoshop version, when the server is connected to PS; omitted otherwise. */
  psVersion?: string;
  plugins?: PluginInfo[];
}

export interface PluginInfo {
  id: string;
}

export interface Bounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ImageChangedLayer {
  id: number;
  pixels?: boolean;
  removed?: boolean;
  bounds?: Bounds;
}

export interface ImageChangedEvent {
  version: string;
  timeStamp: number;
  count: number;
  id: number;
  active?: boolean;
  file?: string;
  closed?: boolean;
  metaDataOnly?: boolean;
  selection?: number[];
  layers?: ImageChangedLayer[];
}

export interface PhotoshopEventMap {
  workspaceChanged: string;
  toolChanged: string;
  quickMaskStateChanged: string;
  documentChanged: number;
  closedDocument: number;
  newDocumentViewCreated: number;
  activeViewChanged: number;
  currentDocumentChanged: number;
  backgroundColorChanged: string;
  foregroundColorChanged: string;
  imageChanged: ImageChangedEvent;
}

export type PhotoshopEventName = keyof PhotoshopEventMap;

export interface MainEventMap {
  "#ready": {
    port: number;
    plugins: PluginInfo[];
  };
  "#closing": {
    reason: "host-close" | "process-exit";
  };
}

export const MAIN_EVENTS = ["#ready", "#closing"] as const;
export type MainEventName = keyof MainEventMap;
export type SubscribableEventName = PhotoshopEventName | MainEventName | (string & {});

/** A request envelope sent client -> server. */
export interface RequestEnvelope<M extends MethodName = MethodName> {
  id: string;
  method: M;
  params: ProtocolMethods[M]["params"];
}

/** A response envelope sent server -> client. */
export type ResponseEnvelope<M extends MethodName = MethodName> =
  | { id: string; ok: true; result: ProtocolMethods[M]["result"] }
  | { id: string; ok: false; error: ProtocolError };

/**
 * Every server -> client push event, keyed by type -> data payload. Open-ended
 * (ADR 0006): declared keys are strongly typed; an undeclared `type` still flows
 * through the looser `on(type: string, ...)` / `EventEnvelope` overloads.
 */
export interface ProtocolEvents extends MainEventMap {
  /** Handshake: the first event after a socket opens, carrying the clientId. */
  connected: { clientId: string };
  workspaceChanged: PhotoshopEventMap["workspaceChanged"];
  toolChanged: PhotoshopEventMap["toolChanged"];
  quickMaskStateChanged: PhotoshopEventMap["quickMaskStateChanged"];
  documentChanged: PhotoshopEventMap["documentChanged"];
  closedDocument: PhotoshopEventMap["closedDocument"];
  newDocumentViewCreated: PhotoshopEventMap["newDocumentViewCreated"];
  activeViewChanged: PhotoshopEventMap["activeViewChanged"];
  currentDocumentChanged: PhotoshopEventMap["currentDocumentChanged"];
  backgroundColorChanged: PhotoshopEventMap["backgroundColorChanged"];
  foregroundColorChanged: PhotoshopEventMap["foregroundColorChanged"];
  imageChanged: PhotoshopEventMap["imageChanged"];
  // Plugin-specific events (e.g. paint_changed/paint_closed) are NOT declared
  // here — a plugin ships its own event type table with its package. The loose
  // `on(type: string, ...)` / `EventEnvelope` overloads still carry undeclared
  // events.
}

export type EventName = keyof ProtocolEvents;

/** A one-way event envelope sent server -> client (no id, no response). */
export interface EventEnvelope<E extends EventName = EventName> {
  type: E;
  data: ProtocolEvents[E];
}

export interface ProtocolError {
  /**
   * Error code. Server-level codes are values of `ErrorCode`; a plugin may throw
   * its own code (defined in its package), which the server surfaces verbatim
   * (open-ended contract, RFC 0006). Typed here as `string` to admit both.
   */
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  source?: ErrorSource;
  requestId?: string;
  method?: string;
  pluginId?: string;
}

export type ErrorSource = "protocol" | "generator" | "photoshop" | "jsx" | "plugin" | "cos" | "sdk";

/**
 * Server-level error codes. Plugin-specific codes (e.g. SidePaint's
 * `PAINT_GONE`/`IMPORT_FAILED`/`VALUE_RESOLVE`/`UNSUPPORTED_SCHEME`) live in
 * their plugin package since RFC 0006 and are surfaced verbatim by the server.
 */
export const ErrorCode = {
  UnknownMethod: "UNKNOWN_METHOD",
  BadRequest: "BAD_REQUEST",
  Internal: "INTERNAL",
  NoDocument: "NO_DOCUMENT",
  DocumentNotFound: "DOCUMENT_NOT_FOUND",
  LayerNotFound: "LAYER_NOT_FOUND",
  PhotoshopUnavailable: "PHOTOSHOP_UNAVAILABLE",
  PhotoshopBusy: "PHOTOSHOP_BUSY",
  JsxFailed: "JSX_FAILED",
  PluginNotFound: "PLUGIN_NOT_FOUND",
  PluginLoadFailed: "PLUGIN_LOAD_FAILED",
  CosUploadFailed: "COS_UPLOAD_FAILED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Frame discriminators shared by both ends (ADR 0005). The three envelope kinds
 * are told apart by characteristic fields: Request has `method`, Response has a
 * boolean `ok`, Event has `type` and no `id`.
 */
export function isRequest(value: unknown): value is RequestEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.method === "string";
}

export function isResponse(value: unknown): value is ResponseEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.ok === "boolean";
}

export function isEvent(value: unknown): value is EventEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && v.id === undefined;
}

/** Decode a raw text frame. Throws on invalid JSON. Shared by both ends. */
export function parseFrame(data: string): unknown {
  return JSON.parse(data);
}

/** Encode a value into a text frame. Shared by both ends. */
export function serializeFrame(value: unknown): string {
  return JSON.stringify(value);
}
