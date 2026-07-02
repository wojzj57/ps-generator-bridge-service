import {
  ProtocolMethod,
  type EventName,
  type MethodName,
  type PhotoshopEventMap,
  type PhotoshopEventName,
  type PluginInfo,
  type ProtocolEvents,
  type ProtocolMethods,
  type ServerInfo,
} from "./protocol";
import { RawConnection, type RawConnectionOptions } from "./connection";
import { PsPhotoshopProxy, type PsJsxRunner } from "./photoshop";

export const DEFAULT_CONNECTION_URL = "ws://127.0.0.1:7700";

export type ConnectionEndpoint =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "plugin"; pluginId: string }>;

export interface ConnectionOptions extends Omit<RawConnectionOptions, "url"> {
  /** Server base URL. Defaults to ws://127.0.0.1:7700. */
  url?: string;
}

type Invoker = <M extends MethodName>(
  method: M,
  params: ProtocolMethods[M]["params"]
) => Promise<ProtocolMethods[M]["result"]>;

type ConnectionListener = (data: unknown) => void;

const PHOTOSHOP_EVENT_NAMES: Record<PhotoshopEventName, true> = {
  workspaceChanged: true,
  toolChanged: true,
  quickMaskStateChanged: true,
  documentChanged: true,
  closedDocument: true,
  newDocumentViewCreated: true,
  activeViewChanged: true,
  currentDocumentChanged: true,
  backgroundColorChanged: true,
  foregroundColorChanged: true,
  imageChanged: true,
};

function isPhotoshopEventName(type: string): type is PhotoshopEventName {
  return Object.prototype.hasOwnProperty.call(PHOTOSHOP_EVENT_NAMES, type);
}

class PublicJsxRunner implements PsJsxRunner {
  constructor(private readonly invoke: Invoker) {}

  run<T = unknown>(script: string): Promise<T> {
    return this.invoke(ProtocolMethod.JsxRun, { script }) as Promise<T>;
  }

  execute<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T> {
    return this.invoke(ProtocolMethod.JsxExecute, { name, params }) as Promise<T>;
  }
}

class PublicPluginClient {
  constructor(private readonly getServerInfo: () => Promise<ServerInfo>) {}

  async list(): Promise<PluginInfo[]> {
    return (await this.getServerInfo()).plugins ?? [];
  }

  async has(id: string): Promise<boolean> {
    return (await this.list()).some((plugin) => plugin.id === id);
  }
}

class PublicModules {
  readonly layer = {
    getLayerInfo: (params?: ProtocolMethods[typeof ProtocolMethod.LayerGetInfo]["params"]) =>
      this.invoke(ProtocolMethod.LayerGetInfo, params),
    getLayerInfoByID: (layerID: number, options?: { getChildren: boolean }) =>
      this.invoke(ProtocolMethod.LayerGetInfoById, { layerID, options }),
    getLayerInfoByIndex: (layerIndex: number, options?: { getChildren: boolean }) =>
      this.invoke(ProtocolMethod.LayerGetInfoByIndex, { layerIndex, options }),
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
    getPreview: (params: ProtocolMethods[typeof ProtocolMethod.ImageGetPreview]["params"]) =>
      this.invoke(ProtocolMethod.ImageGetPreview, params),
    exportDocument: (
      params: ProtocolMethods[typeof ProtocolMethod.ImageExportDocument]["params"]
    ) => this.invoke(ProtocolMethod.ImageExportDocument, params),
  };

  constructor(private readonly invoke: Invoker) {}
}

/**
 * Public root /ws facade. It exposes framework-owned surfaces only: Photoshop
 * events, jsx, Photoshop DOM proxy, plugin discovery, and built-in modules.
 */
export class Connection {
  private readonly raw: RawConnection;
  private readonly call: Invoker;
  private readonly jsxClient: PublicJsxRunner;
  private readonly listeners = new Map<string, Set<ConnectionListener>>();
  private readonly wrappers = new WeakMap<ConnectionListener, Map<string, ConnectionListener>>();
  private readonly activeSubscriptions = new Set<PhotoshopEventName>();
  private readonly pendingSubscriptions = new Map<PhotoshopEventName, symbol>();
  private hasConnected = false;

  readonly jsx: Pick<PublicJsxRunner, "run" | "execute">;
  readonly photoshop: PsPhotoshopProxy;
  readonly plugin: PublicPluginClient;
  readonly modules: PublicModules;
  readonly endpoint: ConnectionEndpoint;

  constructor();
  constructor(options: ConnectionOptions);
  constructor(pluginId: string, options?: ConnectionOptions);
  constructor(pluginIdOrOptions?: string | ConnectionOptions, options: ConnectionOptions = {}) {
    const parsed = parseConnectionArgs(pluginIdOrOptions, options);
    this.endpoint = parsed.endpoint;
    this.raw = new RawConnection({
      ...parsed.options,
      url: buildWebSocketEndpoint(parsed.options.url ?? DEFAULT_CONNECTION_URL, parsed.endpoint),
    });
    this.call = (method, params) => this.raw.invoke(method, params);
    this.jsxClient = new PublicJsxRunner(this.call);
    this.jsx = this.jsxClient;
    this.photoshop = new PsPhotoshopProxy(this.jsxClient);
    this.plugin = new PublicPluginClient(() => this.getServerInfo());
    this.modules = new PublicModules(this.call);
    this.raw.on("connected", () => {
      const isReconnect = this.hasConnected;
      this.hasConnected = true;
      this.replaySubscriptions(isReconnect);
    });
  }

  get clientId(): string | undefined {
    return this.raw.id;
  }

  ready(): Promise<void> {
    return this.raw.ready();
  }

  close(): void {
    this.raw.close();
  }

  /** Send a Request and await its correlated response. */
  invoke<M extends MethodName>(
    method: M,
    params: ProtocolMethods[M]["params"]
  ): Promise<ProtocolMethods[M]["result"]>;
  invoke<T = unknown>(method: string, params?: unknown): Promise<T>;
  invoke(method: string, params?: unknown): Promise<unknown> {
    return this.raw.invoke(method, params);
  }

  /** Listen for a server-pushed Event. Photoshop events auto-subscribe server-side. */
  on<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  on<K extends PhotoshopEventName>(type: K, listener: (data: PhotoshopEventMap[K]) => void): void;
  on(type: string, listener: (data: unknown) => void): void;
  on(type: string, listener: ConnectionListener): void {
    const hadListeners = this.listenerCount(type) > 0;
    this.add(type, listener);
    this.raw.on(type, listener);
    if (!hadListeners && isPhotoshopEventName(type)) this.subscribe(type);
  }

  /** Listen once for a server-pushed Event. */
  once<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  once<K extends PhotoshopEventName>(type: K, listener: (data: PhotoshopEventMap[K]) => void): void;
  once(type: string, listener: (data: unknown) => void): void;
  once(type: string, listener: ConnectionListener): void {
    this.removeOnceWrapper(type, listener);
    const wrapped = (data: unknown) => {
      this.off(type, listener);
      listener(data);
    };
    let wrappersByType = this.wrappers.get(listener);
    if (!wrappersByType) {
      wrappersByType = new Map();
      this.wrappers.set(listener, wrappersByType);
    }
    wrappersByType.set(type, wrapped);
    this.on(type, wrapped);
  }

  /** Remove a server-pushed Event listener. Photoshop events auto-unsubscribe. */
  off<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  off<K extends PhotoshopEventName>(type: K, listener: (data: PhotoshopEventMap[K]) => void): void;
  off(type: string, listener: (data: unknown) => void): void;
  off(type: string, listener: ConnectionListener): void {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);
    const target = wrapped ?? listener;
    this.raw.off(type, target);
    const removed = this.remove(type, target);
    if (removed && this.listenerCount(type) === 0 && isPhotoshopEventName(type)) {
      this.unsubscribe(type);
    }
  }

  getServerInfo(): Promise<ServerInfo> {
    return this.call(ProtocolMethod.GetServerInfo, {});
  }

  private add(type: string, listener: ConnectionListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  private remove(type: string, listener: ConnectionListener): boolean {
    const set = this.listeners.get(type);
    if (!set) return false;
    const removed = set.delete(listener);
    if (set.size === 0) this.listeners.delete(type);
    return removed;
  }

  private listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  private removeOnceWrapper(type: string, listener: ConnectionListener): boolean {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    if (!wrapped) return false;
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);
    this.raw.off(type, wrapped);
    return this.remove(type, wrapped);
  }

  private replaySubscriptions(resetPending: boolean): void {
    this.activeSubscriptions.clear();
    if (resetPending) this.pendingSubscriptions.clear();
    for (const type of this.listeners.keys()) {
      if (isPhotoshopEventName(type)) this.subscribe(type);
    }
  }

  private subscribe(type: PhotoshopEventName): void {
    if (this.activeSubscriptions.has(type) || this.pendingSubscriptions.has(type)) return;
    const pendingToken = Symbol(type);
    this.pendingSubscriptions.set(type, pendingToken);
    void this.call(ProtocolMethod.EventSubscribe, { type })
      .then(() => {
        if (this.pendingSubscriptions.get(type) === pendingToken && this.listenerCount(type) > 0) {
          this.activeSubscriptions.add(type);
        }
      })
      .catch((error) =>
        console.warn(`event subscribe failed for ${type}: ${(error as Error).message}`)
      )
      .finally(() => {
        if (this.pendingSubscriptions.get(type) === pendingToken) {
          this.pendingSubscriptions.delete(type);
        }
      });
  }

  private unsubscribe(type: PhotoshopEventName): void {
    this.activeSubscriptions.delete(type);
    this.pendingSubscriptions.delete(type);
    void this.call(ProtocolMethod.EventUnsubscribe, { type }).catch((error) =>
      console.warn(`event unsubscribe failed for ${type}: ${(error as Error).message}`)
    );
  }
}

function parseConnectionArgs(
  pluginIdOrOptions: string | ConnectionOptions | undefined,
  options: ConnectionOptions
): { endpoint: ConnectionEndpoint; options: ConnectionOptions } {
  if (typeof pluginIdOrOptions === "string") {
    return {
      endpoint: Object.freeze({ kind: "plugin", pluginId: pluginIdOrOptions }),
      options,
    };
  }
  return {
    endpoint: Object.freeze({ kind: "root" }),
    options: pluginIdOrOptions ?? {},
  };
}

function buildWebSocketEndpoint(baseUrl: string, endpoint: ConnectionEndpoint): string {
  const url = new URL(baseUrl);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Unsupported connection URL protocol: ${url.protocol}`);
  }

  const basePath = url.pathname.replace(/\/+$/, "");
  const endpointPath =
    endpoint.kind === "root" ? "/ws" : `/ws/${encodeURIComponent(endpoint.pluginId)}`;
  url.pathname = `${basePath}${endpointPath}`;
  return url.toString();
}
