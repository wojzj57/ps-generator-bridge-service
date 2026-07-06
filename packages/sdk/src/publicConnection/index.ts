import {
  ProtocolMethod,
  type EventName,
  type MethodName,
  type PhotoshopEventMap,
  type PhotoshopEventName,
  type PluginHealth,
  type PluginInfo,
  type ProtocolEvents,
  type ProtocolMethods,
  type ServerInfo,
} from "../protocol";
import { RawConnection } from "../connection";
import { PsPhotoshopProxy } from "../photoshop";
import { SubscriptionManager } from "../connection/subscriptionManager";
import {
  buildWebSocketEndpoint,
  DEFAULT_CONNECTION_URL,
  parseConnectionArgs,
  type ConnectionEndpoint,
  type ConnectionOptions,
} from "./endpoints";
import {
  getConnectionStatus,
  getPluginHealth,
  getPlugins,
  type ConnectionHttpOptions,
  type ConnectionStatus,
} from "./http";
import { PublicJsxRunner, PublicModules, type Invoker } from "./modules";

export { DEFAULT_CONNECTION_URL };
export type { ConnectionEndpoint, ConnectionHttpOptions, ConnectionOptions, ConnectionStatus };

type ConnectionListener = (data: unknown) => void;

/**
 * Public endpoint-aware facade. It exposes framework-owned surfaces only:
 * events, jsx, Photoshop DOM proxy, built-in modules, and open-ended invoke.
 */
export class Connection {
  private readonly raw: RawConnection;
  private readonly call: Invoker;
  private readonly jsxClient: PublicJsxRunner;
  private readonly subscriptions: SubscriptionManager;
  private hasConnected = false;

  readonly jsx: Pick<PublicJsxRunner, "run" | "execute">;
  readonly photoshop: PsPhotoshopProxy;
  readonly modules: PublicModules;
  readonly endpoint: ConnectionEndpoint;

  static status(options: ConnectionHttpOptions = {}): Promise<ConnectionStatus> {
    return getConnectionStatus(options);
  }

  static plugins(options: ConnectionHttpOptions = {}): Promise<PluginInfo[]> {
    return getPlugins(options);
  }

  static pluginHealth(id: string, options: ConnectionHttpOptions = {}): Promise<PluginHealth> {
    return getPluginHealth(id, options);
  }

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
    this.subscriptions = new SubscriptionManager(this.raw);
    this.jsxClient = new PublicJsxRunner(this.call);
    this.jsx = this.jsxClient;
    this.photoshop = new PsPhotoshopProxy(this.jsxClient);
    this.modules = new PublicModules(this.call);
    this.raw.on("connected", () => {
      const isReconnect = this.hasConnected;
      this.hasConnected = true;
      this.subscriptions.replaySubscriptions(isReconnect);
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
    this.subscriptions.on(type, listener);
  }

  /** Listen once for a server-pushed Event. */
  once<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  once<K extends PhotoshopEventName>(type: K, listener: (data: PhotoshopEventMap[K]) => void): void;
  once(type: string, listener: (data: unknown) => void): void;
  once(type: string, listener: ConnectionListener): void {
    this.subscriptions.once(type, listener);
  }

  /** Remove a server-pushed Event listener. Photoshop events auto-unsubscribe. */
  off<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  off<K extends PhotoshopEventName>(type: K, listener: (data: PhotoshopEventMap[K]) => void): void;
  off(type: string, listener: (data: unknown) => void): void;
  off(type: string, listener: ConnectionListener): void {
    this.subscriptions.off(type, listener);
  }

  getServerInfo(): Promise<ServerInfo> {
    return this.call(ProtocolMethod.GetServerInfo, {});
  }
}
