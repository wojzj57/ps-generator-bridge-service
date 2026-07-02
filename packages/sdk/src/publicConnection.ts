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
import { SubscriptionManager } from "./subscriptionManager";

export const DEFAULT_CONNECTION_URL = "ws://127.0.0.1:7700";

export type ConnectionEndpoint =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "plugin"; pluginId: string }>;

export interface ConnectionOptions extends Omit<RawConnectionOptions, "url"> {
  /** Server base URL. Defaults to ws://127.0.0.1:7700. */
  url?: string;
}

export interface ConnectionHttpOptions {
  /** Server base URL. Defaults to ws://127.0.0.1:7700. */
  url?: string;
  /** Inject fetch for tests or nonstandard runtimes. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export type ConnectionStatus =
  | Readonly<{ ok: true; status: "ok" }>
  | Readonly<{ ok: false; error: unknown }>;

type Invoker = <M extends MethodName>(
  method: M,
  params: ProtocolMethods[M]["params"]
) => Promise<ProtocolMethods[M]["result"]>;

type ConnectionListener = (data: unknown) => void;

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
  private readonly subscriptions: SubscriptionManager;
  private hasConnected = false;

  readonly jsx: Pick<PublicJsxRunner, "run" | "execute">;
  readonly photoshop: PsPhotoshopProxy;
  readonly plugin: PublicPluginClient;
  readonly modules: PublicModules;
  readonly endpoint: ConnectionEndpoint;

  static async status(options: ConnectionHttpOptions = {}): Promise<ConnectionStatus> {
    try {
      const url = buildHttpEndpoint(options.url ?? DEFAULT_CONNECTION_URL, "/health");
      const response = await fetchHttp(url, options.fetch);
      if (!response.ok) throw httpStatusError(url, response);
      const body: unknown = await response.json();
      if (!isHealthResponse(body)) throw new Error(`Malformed response from ${url}`);
      return { ok: true, status: "ok" };
    } catch (error) {
      return { ok: false, error };
    }
  }

  static async plugins(options: ConnectionHttpOptions = {}): Promise<PluginInfo[]> {
    const url = buildHttpEndpoint(options.url ?? DEFAULT_CONNECTION_URL, "/plugins");
    const response = await fetchHttp(url, options.fetch);
    if (!response.ok) throw httpStatusError(url, response);

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error(`Malformed JSON from ${url}: ${formatError(error)}`);
    }
    if (!isPluginsResponse(body)) throw new Error(`Malformed response from ${url}`);
    return body.plugins;
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
    this.plugin = new PublicPluginClient(() => this.getServerInfo());
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

function buildHttpEndpoint(baseUrl: string, path: `/${string}`): string {
  const url = new URL(baseUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported connection URL protocol: ${url.protocol}`);
  }

  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}${path}`;
  return url.toString();
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (typeof resolved !== "function") {
    throw new Error("Connection HTTP helpers require fetch; pass options.fetch to use this runtime.");
  }
  return resolved.bind(globalThis);
}

async function fetchHttp(url: string, fetchImpl?: typeof fetch): Promise<Response> {
  try {
    return await resolveFetch(fetchImpl)(url);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`GET ${url} failed: ${formatError(error)}`);
  }
}

function httpStatusError(url: string, response: Response): Error {
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return new Error(`GET ${url} failed with HTTP ${response.status}${statusText}`);
}

function isHealthResponse(value: unknown): value is { status: "ok" } {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>).status === "ok";
}

function isPluginsResponse(value: unknown): value is { plugins: PluginInfo[] } {
  if (typeof value !== "object" || value === null) return false;
  const plugins = (value as Record<string, unknown>).plugins;
  return Array.isArray(plugins) && plugins.every(isPluginInfo);
}

function isPluginInfo(value: unknown): value is PluginInfo {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).id === "string";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
