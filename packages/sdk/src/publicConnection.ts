import {
  ProtocolMethod,
  type MethodName,
  type PhotoshopEventMap,
  type PhotoshopEventName,
  type PluginInfo,
  type ProtocolMethods,
  type ServerInfo,
} from "./protocol";
import { RawConnection, type RawConnectionOptions } from "./connection";
import { PsPhotoshopProxy, type PsJsxRunner } from "./photoshop";

export const DEFAULT_CONNECTION_URL = "ws://127.0.0.1:7700/ws";

export interface ConnectionOptions extends Omit<RawConnectionOptions, "url"> {
  /** Root ws:// URL. Defaults to ws://127.0.0.1:7700/ws. */
  url?: string;
}

type PublicListener<K extends PhotoshopEventName> = (data: PhotoshopEventMap[K]) => void;
type Invoker = <M extends MethodName>(
  method: M,
  params: ProtocolMethods[M]["params"]
) => Promise<ProtocolMethods[M]["result"]>;

class PublicEventClient {
  private readonly listeners = new Map<
    PhotoshopEventName,
    Set<PublicListener<PhotoshopEventName>>
  >();
  private readonly wrappers = new WeakMap<
    PublicListener<PhotoshopEventName>,
    PublicListener<PhotoshopEventName>
  >();
  private readonly activeSubscriptions = new Set<PhotoshopEventName>();
  private readonly pendingSubscriptions = new Set<PhotoshopEventName>();

  constructor(private readonly invoke: Invoker) {}

  on<K extends PhotoshopEventName>(type: K, listener: PublicListener<K>): void {
    const hadListeners = this.listenerCount(type) > 0;
    this.add(type, listener as PublicListener<PhotoshopEventName>);
    if (!hadListeners) this.subscribe(type);
  }

  once<K extends PhotoshopEventName>(type: K, listener: PublicListener<K>): void {
    const wrapped = ((data: PhotoshopEventMap[K]) => {
      this.off(type, wrapped as PublicListener<K>);
      listener(data);
    }) as PublicListener<PhotoshopEventName>;
    this.wrappers.set(listener as PublicListener<PhotoshopEventName>, wrapped);
    this.on(type, wrapped as PublicListener<K>);
  }

  off<K extends PhotoshopEventName>(type: K, listener: PublicListener<K>): void {
    const key = listener as PublicListener<PhotoshopEventName>;
    const wrapped = this.wrappers.get(key);
    this.wrappers.delete(key);
    const removed = this.remove(type, wrapped ?? key);
    if (removed && this.listenerCount(type) === 0) this.unsubscribe(type);
  }

  dispatch(type: string, data: unknown): void {
    const set = this.listeners.get(type as PhotoshopEventName);
    if (!set) return;
    for (const listener of set) listener(data as never);
  }

  replay(): void {
    this.activeSubscriptions.clear();
    for (const type of this.listeners.keys()) this.subscribe(type);
  }

  private add(type: PhotoshopEventName, listener: PublicListener<PhotoshopEventName>): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  private remove(type: PhotoshopEventName, listener: PublicListener<PhotoshopEventName>): boolean {
    const set = this.listeners.get(type);
    if (!set) return false;
    const removed = set.delete(listener);
    if (set.size === 0) this.listeners.delete(type);
    return removed;
  }

  private listenerCount(type: PhotoshopEventName): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  private subscribe(type: PhotoshopEventName): void {
    if (this.activeSubscriptions.has(type) || this.pendingSubscriptions.has(type)) return;
    this.pendingSubscriptions.add(type);
    void this.invoke(ProtocolMethod.EventSubscribe, { type })
      .then(() => {
        if (this.listenerCount(type) > 0) this.activeSubscriptions.add(type);
      })
      .catch((error) =>
        console.warn(`event subscribe failed for ${type}: ${(error as Error).message}`)
      )
      .finally(() => this.pendingSubscriptions.delete(type));
  }

  private unsubscribe(type: PhotoshopEventName): void {
    this.activeSubscriptions.delete(type);
    this.pendingSubscriptions.delete(type);
    void this.invoke(ProtocolMethod.EventUnsubscribe, { type }).catch((error) =>
      console.warn(`event unsubscribe failed for ${type}: ${(error as Error).message}`)
    );
  }
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
  private readonly eventClient: PublicEventClient;
  private readonly jsxClient: PublicJsxRunner;

  readonly event: Pick<PublicEventClient, "on" | "once" | "off">;
  readonly jsx: Pick<PublicJsxRunner, "run" | "execute">;
  readonly photoshop: PsPhotoshopProxy;
  readonly plugin: PublicPluginClient;
  readonly modules: PublicModules;

  constructor(options: ConnectionOptions = {}) {
    this.raw = new RawConnection({ ...options, url: options.url ?? DEFAULT_CONNECTION_URL });
    this.call = (method, params) => this.raw.invoke(method, params);
    this.eventClient = new PublicEventClient(this.call);
    this.jsxClient = new PublicJsxRunner(this.call);
    this.event = this.eventClient;
    this.jsx = this.jsxClient;
    this.photoshop = new PsPhotoshopProxy(this.jsxClient);
    this.plugin = new PublicPluginClient(() => this.getServerInfo());
    this.modules = new PublicModules(this.call);
    this.raw.on("connected", () => this.eventClient.replay());
  }

  get id(): string | undefined {
    return this.raw.id;
  }

  ready(): Promise<void> {
    return this.raw.ready();
  }

  close(): void {
    this.raw.close();
  }

  getServerInfo(): Promise<ServerInfo> {
    return this.call(ProtocolMethod.GetServerInfo, {});
  }
}
