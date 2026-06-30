import { EventEmitter } from "node:events";
import type { PsGenerator } from "../types/generator";

// Photoshop event contract (RFC 0003). The generator owns these payload shapes
// (they are our own protocol JSON, not Adobe PS DOM objects); the SDK re-exports
// them to plugins via src/contract.ts. `EventManager` is the runtime source, so
// the contract tracks the implementation rather than the other way round.

/**
 * Layer/document bounds in pixels. The console logged this as `[Object]` (not
 * expanded); this is the standard generator bounds shape.
 */
export interface Bounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** One entry in `imageChanged.layers` — a layer touched by the change. */
export interface ImageChangedLayer {
  /** Layer id (stable across the session). */
  id: number;
  /** Present (true) when the layer's pixels changed. */
  pixels?: boolean;
  /** Present (true) when the layer was removed in this change. */
  removed?: boolean;
  /** Layer bounds; present on geometry/pixel changes. */
  bounds?: Bounds;
}

/**
 * Payload of the `imageChanged` event. Fields are a union of everything PS may
 * send; only `version` / `timeStamp` / `count` / `id` are always present. A
 * single event carries *either* metadata flags (`metaDataOnly`, `selection`),
 * *or* `layers`, *or* document-level flags (`active` / `file` / `closed`).
 */
export interface ImageChangedEvent {
  /** Generator protocol version, e.g. "1.6.1". */
  version: string;
  /** Seconds since epoch (float), e.g. 1782455135.936. */
  timeStamp: number;
  /** Per-document monotonically increasing change counter (resets per doc id). */
  count: number;
  /** Document id this change belongs to. */
  id: number;
  /** True on the first event for a doc / on activation. */
  active?: boolean;
  /** Document title or full path, e.g. "Test-恢复的.psd" or "C:\\...\\Test.psd". */
  file?: string;
  /** True when the document was closed. */
  closed?: boolean;
  /** True when only metadata changed (no pixel/layer body). */
  metaDataOnly?: boolean;
  /** Selected layer indices; empty array when the selection is cleared. */
  selection?: number[];
  /** Layers touched by this change (pixel edits, bounds, removals). */
  layers?: ImageChangedLayer[];
}

/**
 * Map of Photoshop event name -> payload type passed to the listener. Shapes
 * marked "observed" were confirmed from live PS output; the rest are inferred
 * from the generator protocol docs.
 */
export interface PhotoshopEventMap {
  /** [workspace display name] (inferred). */
  workspaceChanged: string;
  /** Tool name, e.g. "paintbrushTool" / "moveTool" (observed). */
  toolChanged: string;
  /** "enter" | "exit" (inferred). */
  quickMaskStateChanged: string;
  /** Document id (observed). */
  documentChanged: number;
  /** Document id of the closed document (observed). */
  closedDocument: number;
  /** Document id (inferred). */
  newDocumentViewCreated: number;
  /** Document id (inferred). */
  activeViewChanged: number;
  /** Document id of the now-current document (observed). */
  currentDocumentChanged: number;
  /** Color as 6-character hex value (inferred). */
  backgroundColorChanged: string;
  /** Color as 6-character hex value (inferred). */
  foregroundColorChanged: string;
  /** Image/document change descriptor (observed). */
  imageChanged: ImageChangedEvent;
}

/** Listener for a given Photoshop event key. */
export type PhotoshopEventListener<K extends keyof PhotoshopEventMap> = (
  payload: PhotoshopEventMap[K]
) => void;

/**
 * Listen-only typed surface a Plugin reaches through `plugin.events` /
 * `this.events`. `EventManager` (an `EventEmitter`) `implements` this; `emit` is
 * deliberately excluded — a Plugin subscribes, it never dispatches Photoshop
 * events.
 */
export interface PhotoshopEvents {
  on<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
  once<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
  off<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
}

type Listener<K extends keyof PhotoshopEventMap> = PhotoshopEventListener<K>;

/** The events callers may listen to — the runtime source for the allowlist. */
export const PHOTOSHOP_EVENTS: (keyof PhotoshopEventMap)[] = [
  "workspaceChanged",
  "toolChanged",
  "quickMaskStateChanged",
  "documentChanged",
  "closedDocument",
  "newDocumentViewCreated",
  "activeViewChanged",
  "currentDocumentChanged",
  "backgroundColorChanged",
  "foregroundColorChanged",
  "imageChanged",
];

const ALLOWED = new Set<string>(PHOTOSHOP_EVENTS);

// EventEmitter's own meta/internal event names, which flow through our
// newListener/removeListener handlers and must bypass the allowlist guard.
const META = new Set<string>(["newListener", "removeListener", "error"]);

/**
 * Owns the plugin's Photoshop event subscriptions, exposed as a typed
 * `EventEmitter`. Held by `PsBridgeHost` (see `plugin.events`).
 *
 * Subscriptions are lazy: the manager only calls `generator.onPhotoshopEvent`
 * the first time a caller listens to an event, and `removePhotoshopEventListener`
 * once the last listener for that event goes away. Reference counting rides on
 * the `newListener` / `removeListener` meta-events so every add/remove path
 * (`on` / `once` / `off` / `removeAllListeners`) is covered.
 *
 * The `on` / `once` / `off` / `emit` signatures are narrowed to
 * `PhotoshopEventMap`, so only confirmed events can be listened to at compile
 * time; unknown names throw at runtime.
 */
export class EventManager extends EventEmitter implements PhotoshopEvents {
  // One bridge listener per active event, kept so we can detach the exact
  // function from the generator when the last consumer unsubscribes.
  private readonly bridges = new Map<keyof PhotoshopEventMap, (payload: unknown) => void>();

  constructor(private readonly generator: PsGenerator) {
    super();
    // super.on: bypass our narrowed override (these are meta events, not PS events).
    super.on("newListener", (event: string | symbol) => this.onAdd(event));
    super.on("removeListener", (event: string | symbol) => this.onRemove(event));
  }

  // --- typed surface (narrows EventEmitter's string|symbol signatures) ------

  override on<K extends keyof PhotoshopEventMap>(event: K, listener: Listener<K>): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof PhotoshopEventMap>(event: K, listener: Listener<K>): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override addListener<K extends keyof PhotoshopEventMap>(event: K, listener: Listener<K>): this {
    return super.addListener(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof PhotoshopEventMap>(event: K, listener: Listener<K>): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override removeListener<K extends keyof PhotoshopEventMap>(event: K, listener: Listener<K>): this {
    return super.removeListener(event, listener as (...args: unknown[]) => void);
  }

  /** Dispatch a payload to listeners. Fired by the PS bridge; not for external use. */
  override emit<K extends keyof PhotoshopEventMap>(event: K, payload: PhotoshopEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  // --- lazy subscribe / unsubscribe ----------------------------------------

  /** First listener for a PS event -> subscribe upstream once. */
  private onAdd(event: string | symbol): void {
    if (typeof event !== "string" || META.has(event)) return;
    if (!ALLOWED.has(event)) {
      throw new Error(`EventManager: unknown Photoshop event "${event}"`);
    }
    const key = event as keyof PhotoshopEventMap;
    // newListener fires before the listener is added, so 0 means this is the first.
    if (this.listenerCount(key) !== 0) return;
    const bridge = (payload: unknown) => this.emit(key, payload as PhotoshopEventMap[typeof key]);
    this.bridges.set(key, bridge);
    this.generator.onPhotoshopEvent(event, bridge);
  }

  /** Last listener for a PS event removed -> detach the upstream bridge. */
  private onRemove(event: string | symbol): void {
    if (typeof event !== "string" || META.has(event)) return;
    const key = event as keyof PhotoshopEventMap;
    // removeListener fires after removal, so 0 means none are left.
    if (this.listenerCount(key) !== 0) return;
    const bridge = this.bridges.get(key);
    if (!bridge) return;
    this.generator.removePhotoshopEventListener(event, bridge);
    this.bridges.delete(key);
  }
}
