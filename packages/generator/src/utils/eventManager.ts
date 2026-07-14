import { EventEmitter } from "node:events";
import { MAIN_EVENTS, type MainEventMap, type MainEventName } from "@ps-generator-bridge/sdk";
import type { SubscribableDisposer, SubscribableProducer } from "@ps-generator-bridge/sdk/plugin";
import { bridgeError } from "../errors";
import type { PsGenerator } from "../types/generator";
import type { SessionStore } from "../server/connectionSession";

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
  /**
   * Selected layer indices; empty array when cleared.
   * Add 1 before using as a Photoshop layerIndex.
   */
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

export type RuntimeEventListener = (payload: unknown) => void;

export interface PluginEvents {
  subscribe<K extends keyof PhotoshopEventMap>(
    event: K,
    listener: PhotoshopEventListener<K>
  ): Promise<() => void>;
  subscribe<K extends MainEventName>(
    event: K,
    listener: (payload: MainEventMap[K]) => void
  ): Promise<() => void>;
  subscribe(type: string, listener: RuntimeEventListener): Promise<() => void>;
  ensureSubscribable(type: string): Promise<void>;
  on<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
  on<K extends MainEventName>(event: K, listener: (payload: MainEventMap[K]) => void): this;
  on(type: string, listener: RuntimeEventListener): this;
  once<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
  once<K extends MainEventName>(event: K, listener: (payload: MainEventMap[K]) => void): this;
  once(type: string, listener: RuntimeEventListener): this;
  off<K extends keyof PhotoshopEventMap>(event: K, listener: PhotoshopEventListener<K>): this;
  off<K extends MainEventName>(event: K, listener: (payload: MainEventMap[K]) => void): this;
  off(type: string, listener: RuntimeEventListener): this;
  emit(type: string, payload: unknown): boolean;
  dispose(): void;
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
const MAIN = new Set<string>(MAIN_EVENTS);

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

  override removeListener<K extends keyof PhotoshopEventMap>(
    event: K,
    listener: Listener<K>
  ): this {
    return super.removeListener(event, listener as (...args: unknown[]) => void);
  }

  /** Dispatch a payload to listeners. Fired by the PS bridge; not for external use. */
  override emit<K extends keyof PhotoshopEventMap>(
    event: K,
    payload: PhotoshopEventMap[K]
  ): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
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

  dispose(): void {
    for (const [event, bridge] of this.bridges) {
      this.generator.removePhotoshopEventListener(event, bridge);
    }
    this.bridges.clear();
    this.removeAllListeners();
  }
}

export type EventEndpointScope =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "plugin"; pluginId: string }>;

export interface RemoteEventSubscription {
  scope: EventEndpointScope;
  clientId: string;
  sessions: SessionStore;
  type: string;
}

export type RemoteEventWatcher = () => Promise<void> | void;

interface SubscribableState {
  refCount: number;
  started: boolean;
  starting?: Promise<void>;
  dispose?: SubscribableDisposer;
}

export class EventScope {
  private readonly emitter = new EventEmitter();

  on(type: string, listener: RuntimeEventListener): this {
    this.emitter.on(type, listener);
    return this;
  }

  once(type: string, listener: RuntimeEventListener): this {
    this.emitter.once(type, listener);
    return this;
  }

  off(type: string, listener: RuntimeEventListener): this {
    this.emitter.off(type, listener);
    return this;
  }

  emit(type: string, payload: unknown): boolean {
    return this.emitter.emit(type, payload);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}

export class RuntimeEventManager {
  readonly mainScope = new EventScope();
  private readonly pluginScopes = new Map<string, EventScope>();
  private readonly remoteWatchers = new Map<string, RemoteEventWatcher>();
  private readonly subscribables = new Map<string, SubscribableProducer>();
  private readonly subscribableStates = new Map<string, SubscribableState>();
  private readonly warmupReleases = new Map<string, () => void>();
  private readonly warmupStarts = new Map<string, Promise<void>>();

  constructor(readonly generatorEvents: EventManager) {}

  registerRemoteWatcher(type: string, watcher: RemoteEventWatcher): void {
    this.remoteWatchers.set(type, watcher);
  }

  registerSubscribable(type: string, producer: SubscribableProducer): void {
    if (this.subscribables.has(type)) {
      throw new Error(`subscribable already registered: ${type}`);
    }
    this.subscribables.set(type, producer);
  }

  createPluginScope(pluginId: string): EventScope {
    const existing = this.pluginScopes.get(pluginId);
    if (existing) return existing;
    const scope = new EventScope();
    this.pluginScopes.set(pluginId, scope);
    return scope;
  }

  getPluginScope(pluginId: string): EventScope | undefined {
    return this.pluginScopes.get(pluginId);
  }

  createPluginFacade(pluginId: string): PluginEventFacade {
    this.createPluginScope(pluginId);
    return new PluginEventFacade(this, pluginId);
  }

  async subscribeRemote(options: RemoteEventSubscription): Promise<void> {
    await this.remoteWatchers.get(options.type)?.();
    const target = this.resolveRemoteTarget(options.scope, options.type);
    const release = await this.retainSubscribable(options.type);
    let subscribed = false;
    try {
      subscribed = options.sessions.subscribe(options.clientId, options.type, () => {
        const unbind = this.bindRemote(options, target);
        return () => {
          unbind();
          release();
        };
      });
    } finally {
      if (!subscribed) release();
    }
  }

  unsubscribeRemote(options: RemoteEventSubscription): void {
    options.sessions.unsubscribe(options.clientId, options.type);
  }

  emitMain<K extends MainEventName>(type: K, payload: MainEventMap[K]): boolean {
    return this.mainScope.emit(type, payload);
  }

  emitPlugin(pluginId: string, type: string, payload: unknown): boolean {
    return this.createPluginScope(pluginId).emit(type, payload);
  }

  async ensureSubscribable(type: string): Promise<void> {
    if (this.warmupReleases.has(type)) return;
    const pending = this.warmupStarts.get(type);
    if (pending) return pending;

    const start = this.retainSubscribable(type).then((release) => {
      if (this.warmupReleases.has(type)) {
        release();
        return;
      }
      this.warmupReleases.set(type, release);
    });
    this.warmupStarts.set(type, start);
    try {
      await start;
    } finally {
      this.warmupStarts.delete(type);
    }
  }

  disposePlugin(pluginId: string): void {
    const scope = this.pluginScopes.get(pluginId);
    scope?.dispose();
    this.pluginScopes.delete(pluginId);
  }

  dispose(): void {
    for (const release of this.warmupReleases.values()) release();
    this.warmupReleases.clear();
    this.warmupStarts.clear();
    for (const [type, state] of this.subscribableStates) {
      state.refCount = 0;
      this.stopSubscribable(type, state);
    }
    this.subscribableStates.clear();
    this.mainScope.dispose();
    for (const scope of this.pluginScopes.values()) scope.dispose();
    this.pluginScopes.clear();
    this.generatorEvents.dispose();
  }

  async subscribePluginListener(
    type: string,
    pluginId: string,
    listener: RuntimeEventListener
  ): Promise<() => void> {
    const target = this.resolvePluginSubscriptionTarget(pluginId, type);
    const release = await this.retainSubscribable(type);
    onRuntimeTarget(target, type, listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      offRuntimeTarget(target, type, listener);
      release();
    };
  }

  bindPluginListener(type: string, pluginId: string, listener: RuntimeEventListener): () => void {
    const target = this.resolvePluginSubscriptionTarget(pluginId, type);
    onRuntimeTarget(target, type, listener);
    return () => offRuntimeTarget(target, type, listener);
  }

  unbindPluginListener(type: string, pluginId: string, listener: RuntimeEventListener): void {
    offRuntimeTarget(this.resolvePluginSubscriptionTarget(pluginId, type), type, listener);
  }

  private bindRemote(
    options: RemoteEventSubscription,
    target: EventScope | EventManager
  ): () => void {
    const listener = (payload: unknown) =>
      options.sessions.emit(options.clientId, options.type, payload);
    onRuntimeTarget(target, options.type, listener);
    return () => offRuntimeTarget(target, options.type, listener);
  }

  private async retainSubscribable(type: string): Promise<() => void> {
    const producer = this.subscribables.get(type);
    if (!producer) return () => {};

    let state = this.subscribableStates.get(type);
    if (!state) {
      state = { refCount: 0, started: false };
      this.subscribableStates.set(type, state);
    }
    state.refCount += 1;

    try {
      await this.startSubscribable(type, producer, state);
    } catch (error) {
      state.refCount -= 1;
      if (state.refCount === 0) this.subscribableStates.delete(type);
      throw error;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseSubscribable(type);
    };
  }

  private async startSubscribable(
    type: string,
    producer: SubscribableProducer,
    state: SubscribableState
  ): Promise<void> {
    if (state.started) return;
    if (state.starting) return state.starting;

    state.starting = Promise.resolve(
      producer({
        emit: (payload) => {
          this.mainScope.emit(type, payload);
        },
      })
    )
      .then((dispose) => {
        state.dispose = typeof dispose === "function" ? dispose : undefined;
        state.started = true;
      })
      .finally(() => {
        state.starting = undefined;
      });
    return state.starting;
  }

  private releaseSubscribable(type: string): void {
    const state = this.subscribableStates.get(type);
    if (!state) return;
    state.refCount = Math.max(0, state.refCount - 1);
    if (state.refCount !== 0) return;
    this.stopSubscribable(type, state);
  }

  private stopSubscribable(type: string, state: SubscribableState): void {
    if (state.refCount !== 0) return;
    this.subscribableStates.delete(type);
    const dispose = state.dispose;
    state.dispose = undefined;
    state.started = false;
    if (dispose) {
      void Promise.resolve(dispose()).catch(() => {});
    }
  }

  private resolveRemoteTarget(scope: EventEndpointScope, type: string): EventScope | EventManager {
    if (isPhotoshopEvent(type)) return this.generatorEvents;
    if (isMainEvent(type)) return this.mainScope;
    if (type.startsWith("#")) {
      throw bridgeError.badRequest(`unknown main event: ${type}`);
    }
    if (scope.kind === "root") {
      throw bridgeError.badRequest(
        `plugin event subscription is only available on plugin endpoints: ${type}`
      );
    }
    return this.createPluginScope(scope.pluginId);
  }

  private resolvePluginSubscriptionTarget(
    pluginId: string,
    type: string
  ): EventScope | EventManager {
    if (isPhotoshopEvent(type)) return this.generatorEvents;
    if (isMainEvent(type)) return this.mainScope;
    if (type.startsWith("#")) {
      throw bridgeError.badRequest(`unknown main event: ${type}`);
    }
    return this.createPluginScope(pluginId);
  }
}

export class PluginEventFacade implements PluginEvents {
  private readonly disposers = new Map<RuntimeEventListener, Map<string, () => void>>();
  private readonly wrappers = new WeakMap<
    RuntimeEventListener,
    Map<string, RuntimeEventListener>
  >();

  constructor(
    private readonly runtime: RuntimeEventManager,
    private readonly pluginId: string
  ) {}

  async subscribe(type: string, listener: RuntimeEventListener): Promise<() => void> {
    const dispose = await this.runtime.subscribePluginListener(type, this.pluginId, listener);
    this.addDisposer(type, listener, dispose);
    return () => {
      const registered = this.removeDisposer(type, listener);
      (registered ?? dispose)();
    };
  }

  ensureSubscribable(type: string): Promise<void> {
    return this.runtime.ensureSubscribable(type);
  }

  on(type: string, listener: RuntimeEventListener): this {
    this.addDisposer(
      type,
      listener,
      this.runtime.bindPluginListener(type, this.pluginId, listener)
    );
    return this;
  }

  once(type: string, listener: RuntimeEventListener): this {
    this.removeOnceWrapper(type, listener);
    const wrapped = (payload: unknown) => {
      this.off(type, wrapped);
      listener(payload);
    };
    let wrappersByType = this.wrappers.get(listener);
    if (!wrappersByType) {
      wrappersByType = new Map();
      this.wrappers.set(listener, wrappersByType);
    }
    wrappersByType.set(type, wrapped);
    return this.on(type, wrapped);
  }

  off(type: string, listener: RuntimeEventListener): this {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);

    const target = wrapped ?? listener;
    const disposer = this.removeDisposer(type, target);
    if (disposer) {
      disposer();
    } else {
      this.runtime.unbindPluginListener(type, this.pluginId, target);
    }
    return this;
  }

  emit(type: string, payload: unknown): boolean {
    return this.runtime.emitPlugin(this.pluginId, type, payload);
  }

  dispose(): void {
    for (const disposersByType of this.disposers.values()) {
      for (const dispose of disposersByType.values()) dispose();
    }
    this.disposers.clear();
  }

  private addDisposer(type: string, listener: RuntimeEventListener, dispose: () => void): void {
    let disposersByType = this.disposers.get(listener);
    if (!disposersByType) {
      disposersByType = new Map();
      this.disposers.set(listener, disposersByType);
    }
    disposersByType.set(type, dispose);
  }

  private removeDisposer(type: string, listener: RuntimeEventListener): (() => void) | undefined {
    const disposersByType = this.disposers.get(listener);
    const dispose = disposersByType?.get(type);
    disposersByType?.delete(type);
    if (disposersByType?.size === 0) this.disposers.delete(listener);
    return dispose;
  }

  private removeOnceWrapper(type: string, listener: RuntimeEventListener): void {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    if (!wrapped) return;
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);
    this.off(type, wrapped);
  }
}

export function isPhotoshopEvent(type: string): type is keyof PhotoshopEventMap {
  return ALLOWED.has(type);
}

export function isMainEvent(type: string): type is MainEventName {
  return MAIN.has(type);
}

function onRuntimeTarget(
  target: EventScope | EventManager,
  type: string,
  listener: RuntimeEventListener
): void {
  if (target instanceof EventScope) {
    target.on(type, listener);
    return;
  }
  target.on(
    type as keyof PhotoshopEventMap,
    listener as PhotoshopEventListener<keyof PhotoshopEventMap>
  );
}

function offRuntimeTarget(
  target: EventScope | EventManager,
  type: string,
  listener: RuntimeEventListener
): void {
  if (target instanceof EventScope) {
    target.off(type, listener);
    return;
  }
  target.off(
    type as keyof PhotoshopEventMap,
    listener as PhotoshopEventListener<keyof PhotoshopEventMap>
  );
}
