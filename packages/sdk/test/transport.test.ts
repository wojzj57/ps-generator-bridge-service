import { describe, it, expect } from "vitest";
import { createWebSocketTransport } from "../src/connection/transport";

/** Minimal stand-in for a WebSocket implementation, driven by the test. */
class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWS.CONNECTING;
  readonly sent: string[] = [];
  closeCalls = 0;
  closeCode: number | undefined;
  closeReason: string | undefined;
  private handlers: Record<string, (event: unknown) => void> = {};

  constructor(public readonly url: string) {
    // open asynchronously, like a real socket
    setTimeout(() => this.open(), 0);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closeCalls += 1;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = FakeWS.CLOSED;
  }
  addEventListener(type: string, cb: (event: unknown) => void): void {
    this.handlers[type] = cb;
  }
  fire(type: string, event: unknown): void {
    this.handlers[type]?.(event);
  }
  open(): void {
    if (this.readyState !== FakeWS.CONNECTING) return;
    this.readyState = FakeWS.OPEN;
    this.handlers.open?.(undefined);
  }
}

describe("createWebSocketTransport", () => {
  it("throws an actionable error when no global WebSocket exists and none is injected", () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    try {
      expect(() => createWebSocketTransport("ws://x")).toThrow(/Node 22\+|inject a transport/);
    } finally {
      if (original) (globalThis as { WebSocket?: unknown }).WebSocket = original;
    }
  });

  it("uses an injected WebSocket implementation for ready/send/onMessage", async () => {
    let socket: FakeWS | undefined;
    class Capturing extends FakeWS {
      constructor(url: string) {
        super(url);
        socket = this;
      }
    }
    const transport = createWebSocketTransport("ws://x", Capturing as unknown as typeof WebSocket);
    await transport.ready();

    let received = "";
    transport.onMessage((data) => (received = data));
    socket?.fire("message", { data: "hello" });
    expect(received).toBe("hello");

    transport.send("ping");
    expect(socket?.sent).toContain("ping");
  });

  it("defers native close until open when closed while connecting", async () => {
    let socket: FakeWS | undefined;
    class Capturing extends FakeWS {
      constructor(url: string) {
        super(url);
        socket = this;
      }
    }
    const transport = createWebSocketTransport("ws://x", Capturing as unknown as typeof WebSocket);

    transport.close(4000, "dispose");
    transport.close();
    expect(socket?.closeCalls).toBe(0);

    await transport.ready();
    expect(socket?.closeCalls).toBe(1);
    expect(socket?.closeCode).toBe(4000);
    expect(socket?.closeReason).toBe("dispose");
  });

  it("closes immediately when already open", async () => {
    let socket: FakeWS | undefined;
    class Capturing extends FakeWS {
      constructor(url: string) {
        super(url);
        socket = this;
      }
    }
    const transport = createWebSocketTransport("ws://x", Capturing as unknown as typeof WebSocket);
    await transport.ready();

    transport.close();
    expect(socket?.closeCalls).toBe(1);
  });
});
