import {
  type MethodName,
  type ProtocolMethods,
  type ServerInfo,
  type ProtocolEvents,
  type EventName,
  parseFrame,
  isEvent,
} from "./protocol";
import { RequestTracker } from "./requestTracker";
import { type Transport, createWebSocketTransport } from "./transport";

export interface RawConnectionOptions {
  /**
   * ws:// URL to connect to. Use `ws://<host>:<port>/ws` for the public root
   * endpoint, or `ws://<host>:<port>/ws/{pluginId}` for a plugin-scoped raw
   * connection that can invoke that plugin's private methods.
   */
  url: string;
  /** Inject a WebSocket implementation for Node 18-21 (e.g. the `ws` package). */
  WebSocket?: typeof WebSocket;
  /** Override transport creation (primary test seam); receives the per-attempt URL. */
  transportFactory?: (url: string) => Transport;
  /** Per-request timeout in ms (default 10000). */
  timeoutMs?: number;
  /** Max reconnect attempts after a drop before failing (default 5). */
  maxRetries?: number;
  /** Delay between reconnect attempts in ms (default 5000). */
  retryDelayMs?: number;
  /** Optional initial clientId to request via ?id= on first connect. */
  clientId?: string;
}

type EventListener = (data: unknown) => void;

interface ReadyWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Stateful SDK entry point (ADR 0005/0007). Owns a Transport factory and:
 * reconnects on drop (up to maxRetries), remembers and re-sends its clientId,
 * resolves `ready()` only once the server's `connected` handshake arrives,
 * correlates `invoke` requests to responses, and dispatches subscribed Events.
 *
 * Readiness is a state machine, not a single promise: a transient drop moves it
 * back to "connecting" so new and queued `invoke`s wait for the next handshake;
 * exhausting the retry budget moves it to "failed" and rejects everything.
 */
export class RawConnection {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly requests: RequestTracker;
  private readonly listeners = new Map<string, Set<EventListener>>();

  private transport: Transport | undefined;
  private clientId: string | undefined;
  private attempts = 0;
  private state: "connecting" | "ready" | "failed" = "connecting";
  private failError: Error | undefined;
  private readyWaiters: ReadyWaiter[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: RawConnectionOptions) {
    this.maxRetries = options.maxRetries ?? 5;
    this.retryDelayMs = options.retryDelayMs ?? 5_000;
    this.requests = new RequestTracker(options.timeoutMs ?? 10_000);
    this.clientId = options.clientId;
    this.connect();
  }

  /** The clientId assigned by the server (undefined until the first handshake). */
  get id(): string | undefined {
    return this.clientId;
  }

  /** Resolves once connected (handshake received); rejects if retries are exhausted. */
  ready(): Promise<void> {
    if (this.state === "ready") return Promise.resolve();
    if (this.state === "failed") return Promise.reject(this.failError);
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  /** Fetch the server's identity + (when connected to PS) its Photoshop version. */
  getServerInfo(): Promise<ServerInfo> {
    return this.invoke("getServerInfo", {});
  }

  /** Send a Request and await its correlated response. Queues during reconnect. */
  invoke<M extends MethodName>(
    method: M,
    params: ProtocolMethods[M]["params"]
  ): Promise<ProtocolMethods[M]["result"]>;
  invoke(method: string, params?: unknown): Promise<unknown>;
  async invoke(method: string, params?: unknown): Promise<unknown> {
    await this.ready();
    return this.requests.send(this.transport, method, params);
  }

  /** Subscribe to a server-pushed Event. */
  on<E extends EventName>(type: E, listener: (data: ProtocolEvents[E]) => void): void;
  on(type: string, listener: (data: unknown) => void): void;
  on(type: string, listener: EventListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  /** Unsubscribe a previously registered Event listener. */
  off(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Close the connection: stop reconnecting and reject all in-flight work. */
  close(): void {
    if (this.state === "failed") return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.fail(new Error("Connection closed"));
    this.transport?.close();
  }

  private connect(): void {
    if (this.state === "failed") return;
    const url = this.buildUrl();
    const transport = this.options.transportFactory
      ? this.options.transportFactory(url)
      : createWebSocketTransport(url, this.options.WebSocket);
    this.transport = transport;

    let settled = false;
    const onDead = (): void => {
      if (settled) return;
      settled = true;
      if (this.transport === transport) this.handleDrop();
    };
    transport.onMessage((data) => this.handleMessage(data));
    transport.onClose(onDead);
    transport.ready().then(() => undefined, onDead);
  }

  private buildUrl(): string {
    if (!this.clientId) return this.options.url;
    const sep = this.options.url.includes("?") ? "&" : "?";
    return `${this.options.url}${sep}id=${encodeURIComponent(this.clientId)}`;
  }

  private handleMessage(data: string): void {
    let message: unknown;
    try {
      message = parseFrame(data);
    } catch {
      return; // ignore non-JSON noise
    }
    if (isEvent(message)) {
      if (message.type === "connected") {
        this.clientId = (message.data as { clientId: string }).clientId;
        this.attempts = 0; // a successful handshake refills the retry budget
        this.markReady();
      }
      this.dispatchEvent(message.type, message.data);
      return;
    }
    this.requests.settle(message);
  }

  private handleDrop(): void {
    if (this.state === "failed") return;
    this.transport = undefined;
    this.state = "connecting"; // queued + future invokes wait for the next handshake
    if (this.attempts >= this.maxRetries) {
      this.fail(
        new Error(`Connection to ${this.options.url} failed after ${this.maxRetries} retries`)
      );
      return;
    }
    this.attempts += 1;
    this.retryTimer = setTimeout(() => this.connect(), this.retryDelayMs);
  }

  private markReady(): void {
    this.state = "ready";
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }

  private fail(error: Error): void {
    this.state = "failed";
    this.failError = error;
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
    this.requests.failAll(error);
  }

  private dispatchEvent(type: string, data: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) listener(data);
  }
}

/** @deprecated Use RawConnectionOptions. */
export type ConnectionOptions = RawConnectionOptions;
