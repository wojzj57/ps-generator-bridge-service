/**
 * Transport seam (ADR 0002). The client only knows this interface; the default
 * implementation uses the global `WebSocket`. Callers on Node 18-21 (which lack a
 * global WebSocket) or in tests inject their own implementation.
 */
export interface Transport {
  /** Resolves once the transport is open and ready to send. */
  ready(): Promise<void>;
  send(data: string): void;
  onMessage(listener: (data: string) => void): void;
  /** Fired when the underlying connection drops (used by Connection to reconnect). */
  onClose(listener: () => void): void;
  close(): void;
}

/**
 * Build a Transport from a WebSocket constructor + url. If none is injected,
 * falls back to the global `WebSocket`, throwing an actionable error when it is
 * absent (Node 18-21) rather than a cryptic `WebSocket is not defined`.
 *
 * The upgrade path (ADR 0002) — auto-resolving `ws` on Node < 22 — would slot in
 * at `resolveGlobalWebSocket` without changing this signature.
 */
export function createWebSocketTransport(url: string, WebSocketImpl?: typeof WebSocket): Transport {
  const Ctor = WebSocketImpl ?? resolveGlobalWebSocket();
  const ws = new Ctor(url);

  let opened = false;
  let resolveReady!: () => void;
  let rejectReady!: (err: unknown) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let closeListener: (() => void) | undefined;

  ws.addEventListener("open", () => {
    opened = true;
    resolveReady();
  });
  ws.addEventListener("error", () => {
    if (!opened) rejectReady(new Error(`WebSocket connection to ${url} failed`));
  });
  ws.addEventListener("close", () => closeListener?.());

  return {
    ready: () => readyPromise,
    send: (data) => ws.send(data),
    onMessage: (listener) =>
      ws.addEventListener("message", (event) => listener(String((event as MessageEvent).data))),
    onClose: (listener) => {
      closeListener = listener;
    },
    close: () => ws.close(),
  };
}

function resolveGlobalWebSocket(): typeof WebSocket {
  const candidate = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!candidate) {
    throw new Error(
      "No global WebSocket is available (Node 18-21 lack it). Upgrade to Node 22+, " +
        "or inject a transport, e.g. " +
        "`new PsBridgeClient({ url, WebSocket: (await import('ws')).WebSocket })`."
    );
  }
  return candidate;
}
