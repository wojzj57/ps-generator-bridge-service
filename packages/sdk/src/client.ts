import {
  type MethodName,
  type ProtocolMethods,
  type ServerInfo,
} from "./protocol";
import { RequestTracker } from "./requestTracker";
import { type Transport, createWebSocketTransport } from "./transport";

export interface PsBridgeClientOptions {
  /** ws:// URL of the server. Required unless a custom `transport` is given. */
  url?: string;
  /** Inject a transport (primary seam; tests pass a FakeTransport). */
  transport?: Transport;
  /** Inject a WebSocket implementation for Node 18-21 (e.g. the `ws` package). */
  WebSocket?: typeof WebSocket;
  /** Per-request timeout in ms (default 10000). */
  timeoutMs?: number;
}

/**
 * Typed client over a {@link Transport}. Correlates each request to its response
 * by id; rejects on protocol errors, timeouts, or close.
 *
 * @deprecated Use {@link Connection}, which adds reconnect, a stable clientId, and
 * Event subscription. Retained until existing callers migrate.
 */
export class PsBridgeClient {
  private readonly transport: Transport;
  private readonly requests: RequestTracker;

  constructor(options: PsBridgeClientOptions) {
    this.requests = new RequestTracker(options.timeoutMs ?? 10_000);
    if (options.transport) {
      this.transport = options.transport;
    } else if (options.url) {
      this.transport = createWebSocketTransport(options.url, options.WebSocket);
    } else {
      throw new Error("PsBridgeClient requires either `url` or `transport`.");
    }
    this.transport.onMessage((data) => this.handleMessage(data));
  }

  /** Fetch the server's identity + (when connected to PS) its Photoshop version. */
  getServerInfo(): Promise<ServerInfo> {
    return this.request("getServerInfo", {});
  }

  /** Send a typed request and await its correlated response. */
  async request<M extends MethodName>(
    method: M,
    params: ProtocolMethods[M]["params"]
  ): Promise<ProtocolMethods[M]["result"]> {
    await this.transport.ready();
    return this.requests.send(this.transport, method, params);
  }

  /** Reject all in-flight requests and close the transport. */
  close(): void {
    this.requests.failAll(new Error("Client closed"));
    this.transport.close();
  }

  private handleMessage(data: string): void {
    this.requests.settleFrame(data);
  }
}
