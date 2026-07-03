import type { ImageChangedEvent, PluginInfo } from "./models";

/** Host-owned and built-in module events available through plugin `this.on` and remote `Connection.on`. */
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

export type MainEventName = keyof MainEventMap;
export type SubscribableEventName = PhotoshopEventName | MainEventName | (string & {});

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
  // here. A plugin ships its own event type table with its package. The loose
  // `on(type: string, ...)` / `EventEnvelope` overloads still carry undeclared
  // events.
}

export type EventName = keyof ProtocolEvents;
