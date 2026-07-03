import type { ImageChangedEvent, PluginInfo, PsRect } from "./models";

/**
 * Main event names shared by the sdk type surface and generator runtime.
 * Host lifecycle events and built-in module events live here; plugin-local
 * events remain open string names owned by each plugin package.
 */
export const MainEvent = {
  Ready: "#ready",
  Closing: "#closing",
  SelectionChanged: "selection:changed",
} as const;
export type MainEvent = (typeof MainEvent)[keyof typeof MainEvent];

/** Host-owned and built-in module events available through plugin `this.on` and remote `Connection.on`. */
export interface MainEventMap {
  [MainEvent.Ready]: {
    port: number;
    plugins: PluginInfo[];
  };
  [MainEvent.Closing]: {
    reason: "host-close" | "process-exit";
  };
  [MainEvent.SelectionChanged]: PsRect | null;
}

type AssertNever<T extends never> = T;
type _MainEventMapCoversMainEvents = AssertNever<Exclude<MainEvent, keyof MainEventMap>>;
type _MainEventsCoverMainEventMap = AssertNever<Exclude<keyof MainEventMap, MainEvent>>;

export const MAIN_EVENTS = Object.freeze(Object.values(MainEvent)) as readonly MainEvent[];

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
