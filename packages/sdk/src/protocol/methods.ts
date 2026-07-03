import type { SubscribableEventName } from "./events";
import type {
  LayerSpec,
  PsDocument,
  PsLayer,
  ServerInfo,
  WsImageResult,
} from "./models";

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
  // (e.g. SidePaint:*) are NOT declared here; a plugin ships its own method type
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
  // WS protocol cleanly. `settings` is widened to `Record<string, unknown>` so
  // the contract does not drag generator-core's `GetPixmapSettings` namespace
  // across the boundary.
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
