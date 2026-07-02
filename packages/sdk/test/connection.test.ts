import { describe, it, expect } from "vitest";
import { RawConnection, type RawConnectionOptions } from "../src/connection";
import { isPsBridgeError } from "../src/errors";
import type { Transport } from "../src/transport";

/** A transport the test drives by hand: open/fail/recv/drop. */
class FakeConn implements Transport {
  readonly sent: string[] = [];
  closed = false;
  private msg: ((d: string) => void) | undefined;
  private onCloseCb: (() => void) | undefined;
  private resolveOpen!: () => void;
  private rejectOpen!: (e: unknown) => void;
  private readonly readyP: Promise<void>;

  constructor(readonly url: string) {
    this.readyP = new Promise((res, rej) => {
      this.resolveOpen = res;
      this.rejectOpen = rej;
    });
    this.readyP.catch(() => {});
  }
  ready(): Promise<void> {
    return this.readyP;
  }
  send(d: string): void {
    this.sent.push(d);
  }
  onMessage(cb: (d: string) => void): void {
    this.msg = cb;
  }
  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }
  close(): void {
    this.closed = true;
    this.onCloseCb?.();
  }
  // --- test controls ---
  open(): void {
    this.resolveOpen();
  }
  failOpen(): void {
    this.rejectOpen(new Error("open failed"));
  }
  recv(frame: unknown): void {
    this.msg?.(JSON.stringify(frame));
  }
  drop(): void {
    this.onCloseCb?.();
  }
  lastSent(): any {
    return JSON.parse(this.sent.at(-1) as string);
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function harness(opts: Partial<RawConnectionOptions> = {}) {
  const conns: FakeConn[] = [];
  const conn = new RawConnection({
    url: "ws://x/ws",
    transportFactory: (url) => {
      const c = new FakeConn(url);
      conns.push(c);
      return c;
    },
    retryDelayMs: 0,
    maxRetries: 2,
    timeoutMs: 50,
    ...opts,
  });
  return { conn, conns };
}

async function connected(conn: RawConnection, conns: FakeConn[], clientId = "c1"): Promise<void> {
  conns[0]!.open();
  conns[0]!.recv({ type: "connected", data: { clientId } });
  await conn.ready();
}

describe("RawConnection", () => {
  it("becomes ready on the connected handshake and records the clientId", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns, "abc");
    expect(conn.id).toBe("abc");
  });

  it("round-trips invoke after the handshake", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    const p = conn.invoke("getServerInfo", {});
    await tick();
    const sent = conns[0]!.lastSent();
    expect(sent.method).toBe("getServerInfo");
    conns[0]!.recv({ id: sent.id, ok: true, result: { name: "x", version: "1" } });
    await expect(p).resolves.toEqual({ name: "x", version: "1" });
  });

  it("rejects on an error response", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    const p = conn.invoke("getServerInfo", {});
    await tick();
    const sent = conns[0]!.lastSent();
    conns[0]!.recv({ id: sent.id, ok: false, error: { code: "INTERNAL", message: "boom" } });
    await expect(p).rejects.toMatchObject({
      code: "INTERNAL",
      message: "boom",
      requestId: sent.id,
      method: "getServerInfo",
    });
  });

  it("fails ready on a structured error event before the connected handshake", async () => {
    const { conn, conns } = harness();
    conns[0]!.open();
    conns[0]!.recv({
      type: "error",
      data: { code: "PLUGIN_NOT_FOUND", message: "unknown plugin: missing", pluginId: "missing" },
    });
    try {
      await conn.ready();
      throw new Error("expected rejection");
    } catch (error) {
      expect(isPsBridgeError(error)).toBe(true);
      if (isPsBridgeError(error)) {
        expect(error.code).toBe("PLUGIN_NOT_FOUND");
        expect(error.pluginId).toBe("missing");
      }
    }
  });

  it("keeps ordinary error events dispatchable after ready", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    let got: unknown;
    conn.on("error", (data) => (got = data));
    conns[0]!.recv({ type: "error", data: { code: "PLUGIN_EVENT", message: "x" } });
    expect(got).toEqual({ code: "PLUGIN_EVENT", message: "x" });
  });

  it("queues an invoke during reconnect and flushes it, reusing the clientId", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns, "c1");
    conns[0]!.drop();
    const p = conn.invoke("getServerInfo", {}); // queued: state is "connecting"
    await tick(); // retry fires -> conns[1] created
    expect(conns).toHaveLength(2);
    expect(conns[1]!.url).toContain("id=c1"); // reconnect re-sends the clientId
    conns[1]!.open();
    conns[1]!.recv({ type: "connected", data: { clientId: "c1" } });
    await tick(); // ready resolves -> queued invoke sends on conns[1]
    const sent = conns[1]!.lastSent();
    expect(sent.method).toBe("getServerInfo");
    conns[1]!.recv({ id: sent.id, ok: true, result: { ok: true } });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it("fails terminally after exhausting retries, rejecting ready and pending invokes", async () => {
    const { conn, conns } = harness({ maxRetries: 1 });
    const p = conn.invoke("getServerInfo", {});
    p.catch(() => {}); // avoid unhandled rejection before assertion
    conns[0]!.failOpen(); // death 1: attempts 0 < 1 -> retry
    await tick(); // microtask: onDead schedules the retry setTimeout
    await tick(); // macrotask: retry runs -> conns[1] created
    expect(conns).toHaveLength(2);
    conns[1]!.failOpen(); // death 2: attempts 1 >= 1 -> fail
    await expect(conn.ready()).rejects.toThrow(/failed after 1 retries/);
    await expect(p).rejects.toThrow(/failed after 1 retries/);
  });

  it("delivers subscribed events and ignores non-JSON noise", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    let got: unknown;
    conn.on("ping", (data) => (got = data));
    expect(conns[0]!.sent).toHaveLength(0);
    conns[0]!.recv("not json"); // ignored
    conns[0]!.recv({ type: "ping", data: { n: 1 } });
    expect(got).toEqual({ n: 1 });
  });

  it("stops delivering to an unsubscribed listener", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    let count = 0;
    const listener = (): void => {
      count += 1;
    };
    conn.on("ping", listener);
    conns[0]!.recv({ type: "ping", data: {} });
    conn.off("ping", listener);
    conns[0]!.recv({ type: "ping", data: {} });
    expect(count).toBe(1);
  });

  it("close rejects pending requests and closes the transport", async () => {
    const { conn, conns } = harness();
    await connected(conn, conns);
    const p = conn.invoke("getServerInfo", {});
    await tick();
    conn.close();
    await expect(p).rejects.toThrow(/closed/i);
    expect(conns[0]!.closed).toBe(true);
  });
});
