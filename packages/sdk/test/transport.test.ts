import { describe, it, expect } from "vitest";
import { createWebSocketTransport } from "../src/transport";

/** Minimal stand-in for a WebSocket implementation, driven by the test. */
class FakeWS {
  static OPEN = 1;
  readyState = 1;
  readonly sent: string[] = [];
  private handlers: Record<string, (event: unknown) => void> = {};

  constructor(public readonly url: string) {
    // open asynchronously, like a real socket
    setTimeout(() => this.handlers.open?.(undefined), 0);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
  addEventListener(type: string, cb: (event: unknown) => void): void {
    this.handlers[type] = cb;
  }
  fire(type: string, event: unknown): void {
    this.handlers[type]?.(event);
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
});
