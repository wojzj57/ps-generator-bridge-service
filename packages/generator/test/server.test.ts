import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { createServer, type PsBridgeServer } from "../src/server";
import { BasePlugin, ws, api, bootstrap, type PluginHost } from "@ps-generator-bridge/sdk/plugin";
import { EventManager } from "../src/utilis/eventManager";
import { JsxRunner } from "../src/utilis/jsxRunner";
import type { Logger } from "../src/utilis/logger";
import { fakeGenerator, type FakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

// A fixture plugin for the per-plugin WS/HTTP tests (RFC 0004). Its handlers
// do not reach the plugin, so a bare cast PluginHost suffices for construction.
class EchoService extends BasePlugin {
  static readonly id = "echo";

  @ws("echo:ping")
  ping(params: { n?: number }): { pong: number } {
    return { pong: params?.n ?? 0 };
  }

  @api("/status")
  async status(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

// A plain decorated module exercising global fallback dispatch from a plugin
// connection (scoped miss -> global Registry hit).
class GreetModule {
  @ws("greet")
  greet(params: { name?: string }): { hello: string } {
    return { hello: params?.name ?? "world" };
  }
}

let server: PsBridgeServer | undefined;
const openSockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of openSockets.splice(0)) ws.close();
  await server?.close();
  server = undefined;
});

/**
 * Build the server, register the given plugins, then listen — so plugin @api
 * routes land before `listen()` (fastify requires it). Mirrors the plugin's
 * onInit ordering (RFC 0004).
 */
async function start(...plugins: BasePlugin[]): Promise<PsBridgeServer> {
  const s = createServer({ port: 0, generator: fakeGenerator(), logger: silentLogger });
  for (const svc of plugins) s.pluginManager.register(svc);
  await s.listen();
  server = s;
  return s;
}

const echo = () => new EchoService("echo", {} as unknown as PluginHost);

async function startRoot(): Promise<{
  server: PsBridgeServer;
  generator: FakeGenerator;
}> {
  const generator = fakeGenerator();
  const s = createServer({
    port: 0,
    generator,
    jsx: new JsxRunner(generator, silentLogger),
    events: new EventManager(generator),
    logger: silentLogger,
  });
  s.pluginManager.register(echo());
  bootstrap(new GreetModule(), s.registry);
  await s.listen();
  server = s;
  return { server: s, generator };
}

/** Connect to /ws/{pluginId} and resolve once the `connected` handshake arrives. */
function connect(
  port: number,
  pluginId: string,
  id?: string
): Promise<{ ws: WebSocket; clientId: string }> {
  const url = `ws://127.0.0.1:${port}/ws/${pluginId}${id ? `?id=${id}` : ""}`;
  const ws = new WebSocket(url);
  openSockets.push(ws);
  return new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("message", (data) => {
      const msg = JSON.parse(String(data));
      resolve({ ws, clientId: msg.data.clientId });
    });
  });
}

/** Connect to /ws/{pluginId} and resolve the first frame (for error-frame tests). */
function firstFrame(port: number, pluginId: string): Promise<{ ws: WebSocket; frame: any }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${pluginId}`);
  openSockets.push(ws);
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve({ ws, frame: JSON.parse(String(data)) }));
  });
}

/** Connect to root /ws and resolve once the `connected` handshake arrives. */
function connectRoot(port: number, id?: string): Promise<{ ws: WebSocket; clientId: string }> {
  const url = `ws://127.0.0.1:${port}/ws${id ? `?id=${id}` : ""}`;
  const ws = new WebSocket(url);
  openSockets.push(ws);
  return new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("message", (data) => {
      const msg = JSON.parse(String(data));
      resolve({ ws, clientId: msg.data.clientId });
    });
  });
}

/** Send a request and resolve on its Response (a frame with an `id`), skipping events. */
function requestOnce(ws: WebSocket, frame: unknown): Promise<any> {
  return new Promise((resolve) => {
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data));
      if (msg && typeof msg.id === "string") {
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify(frame));
  });
}

/** Resolve on the next Event of the given type. */
function nextEvent(ws: WebSocket, type: string): Promise<any> {
  return new Promise((resolve) => {
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data));
      if (msg && msg.type === type) {
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

describe("per-plugin server (RFC 0004)", () => {
  it("serves GET /health as a liveness probe", async () => {
    const s = await start();
    const response = await fetch(`http://127.0.0.1:${s.port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("GET /plugins lists registered plugins", async () => {
    const s = await start(echo());
    const response = await fetch(`http://127.0.0.1:${s.port}/plugins`);
    expect(await response.json()).toEqual({ plugins: [{ id: "echo" }] });
  });

  it("sends a connected handshake with a generated clientId on /ws/{id}", async () => {
    const s = await start(echo());
    const { clientId } = await connect(s.port, "echo");
    expect(typeof clientId).toBe("string");
    expect(clientId.length).toBeGreaterThan(0);
  });

  it("honours a client-supplied id via ?id=", async () => {
    const s = await start(echo());
    const { clientId } = await connect(s.port, "echo", "fixed-123");
    expect(clientId).toBe("fixed-123");
  });

  it("dispatches a scoped @ws method on /ws/{id}", async () => {
    const s = await start(echo());
    const { ws } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "1", method: "echo:ping", params: { n: 7 } });
    expect(response).toEqual({ id: "1", ok: true, result: { pong: 7 } });
  });

  it("falls back to the global Registry for module methods", async () => {
    const s = await start(echo());
    // @ws methods are runtime-capable (Map.set), so bootstrapping after listen is fine.
    bootstrap(new GreetModule(), s.registry);
    const { ws } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "2", method: "greet", params: { name: "ada" } });
    expect(response).toEqual({ id: "2", ok: true, result: { hello: "ada" } });
  });

  it("falls back to the global Registry for getServerInfo, carrying the plugin list", async () => {
    const s = await start(echo());
    const { ws } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "3", method: "getServerInfo", params: {} });
    expect(response.ok).toBe(true);
    expect(response.result.psVersion).toBe("26.0.0");
    expect(response.result.plugins).toEqual([{ id: "echo" }]);
  });

  it("returns UNKNOWN_METHOD when neither scoped nor global matches", async () => {
    const s = await start(echo());
    const { ws } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "4", method: "nope", params: {} });
    expect(response).toMatchObject({ id: "4", ok: false, error: { code: "UNKNOWN_METHOD" } });
  });

  it("broadcast reaches every client of the plugin (scoped to /ws/{id})", async () => {
    const s = await start(echo());
    const a = await connect(s.port, "echo");
    const b = await connect(s.port, "echo");
    const gotA = nextEvent(a.ws, "ping");
    const gotB = nextEvent(b.ws, "ping");
    s.pluginManager.get("echo")!.plugin.broadcast("ping", { n: 1 });
    expect((await gotA).data).toEqual({ n: 1 });
    expect((await gotB).data).toEqual({ n: 1 });
  });

  it("send reaches only the targeted client of the plugin", async () => {
    const s = await start(echo());
    const a = await connect(s.port, "echo", "client-a");
    const b = await connect(s.port, "echo", "client-b");
    let bGotIt = false;
    b.ws.on("message", (data) => {
      if (JSON.parse(String(data)).type === "hey") bGotIt = true;
    });
    const gotA = nextEvent(a.ws, "hey");
    s.pluginManager.get("echo")!.plugin.send("client-a", "hey", { only: "a" });
    expect((await gotA).data).toEqual({ only: "a" });
    await new Promise((r) => setTimeout(r, 20));
    expect(bGotIt).toBe(false);
  });

  it("broadcast does not leak to a different plugin's clients", async () => {
    const s = await start(echo(), new EchoService("other", {} as unknown as PluginHost));
    const echoClient = await connect(s.port, "echo");
    const otherClient = await connect(s.port, "other");
    let otherGotIt = false;
    otherClient.ws.on("message", (data) => {
      if (JSON.parse(String(data)).type === "ping") otherGotIt = true;
    });
    const gotEcho = nextEvent(echoClient.ws, "ping");
    s.pluginManager.get("echo")!.plugin.broadcast("ping", { n: 2 });
    expect((await gotEcho).data).toEqual({ n: 2 });
    await new Promise((r) => setTimeout(r, 20));
    expect(otherGotIt).toBe(false);
  });

  it("takes over the entry when the same id reconnects (old socket closed)", async () => {
    const s = await start(echo());
    const first = await connect(s.port, "echo", "dup");
    const oldClosed = new Promise<void>((resolve) => first.ws.once("close", () => resolve()));
    const second = await connect(s.port, "echo", "dup");
    await oldClosed; // old socket was closed by the takeover
    const got = nextEvent(second.ws, "ping");
    s.pluginManager.get("echo")!.plugin.broadcast("ping", { n: 3 });
    expect((await got).data).toEqual({ n: 3 });
  });

  it("sends an error frame and closes on an unknown plugin id", async () => {
    const s = await start(echo());
    const { ws, frame } = await firstFrame(s.port, "nope");
    expect(frame.type).toBe("error");
    expect(frame.data.code).toBe("PLUGIN_NOT_FOUND");
    expect(frame.data.pluginId).toBe("nope");
    await new Promise<void>((resolve) => ws.once("close", () => resolve()));
  });

  it("serves a plugin @api route under /{pluginId}/{path}", async () => {
    const s = await start(echo());
    const response = await fetch(`http://127.0.0.1:${s.port}/echo/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects a module @api whose first segment collides with a plugin id", async () => {
    // @api collision is a registration-time guard, so it throws before fastify
    // route insertion — safe to exercise after listen.
    const s = await start(echo());
    s.registry.reservedSegments = new Set(s.pluginManager.ids);
    class EchoRoute {
      @api("/echo/thing")
      thing(): unknown {
        return {};
      }
    }
    expect(() => bootstrap(new EchoRoute(), s.registry)).toThrow(/reserved plugin id/);
  });
});

describe("root /ws server", () => {
  it("handshakes, honors ?id, and dispatches global methods only", async () => {
    const { server: s } = await startRoot();
    const { ws, clientId } = await connectRoot(s.port, "root-fixed");
    expect(clientId).toBe("root-fixed");

    const info = await requestOnce(ws, {
      id: "1",
      method: ProtocolMethod.GetServerInfo,
      params: {},
    });
    expect(info.result.plugins).toEqual([{ id: "echo" }]);

    const greet = await requestOnce(ws, { id: "2", method: "greet", params: { name: "ada" } });
    expect(greet).toEqual({ id: "2", ok: true, result: { hello: "ada" } });

    const scoped = await requestOnce(ws, { id: "3", method: "echo:ping", params: { n: 1 } });
    expect(scoped).toMatchObject({ id: "3", ok: false, error: { code: "UNKNOWN_METHOD" } });
  });

  it("dispatches jsx builtins through the injected JsxRunner", async () => {
    const { server: s, generator } = await startRoot();
    generator.onEvaluateJSXString = () => 4;
    generator.onEvaluateJSXFile = () => ({ ok: true });
    const { ws } = await connectRoot(s.port);

    const run = await requestOnce(ws, {
      id: "4",
      method: ProtocolMethod.JsxRun,
      params: { script: "2 + 2" },
    });
    expect(run).toEqual({ id: "4", ok: true, result: 4 });
    expect(generator.jsxStringCalls[0]?.script).toBe("2 + 2");

    const execute = await requestOnce(ws, {
      id: "5",
      method: ProtocolMethod.JsxExecute,
      params: { name: "Document/getDocumentInfo", params: { id: 1 } },
    });
    expect(execute).toEqual({ id: "5", ok: true, result: { ok: true } });
    expect(generator.jsxCalls[0]?.path).toMatch(/Document[\\/]getDocumentInfo\.jsx$/);
  });

  it("pushes subscribed Photoshop events only to matching root clients", async () => {
    const { server: s, generator } = await startRoot();
    const imageClient = await connectRoot(s.port, "image-client");
    const toolClient = await connectRoot(s.port, "tool-client");

    const subscribed = await requestOnce(imageClient.ws, {
      id: "6",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    expect(subscribed).toEqual({ id: "6", ok: true, result: { ok: true } });

    let toolGotIt = false;
    toolClient.ws.on("message", (data) => {
      if (JSON.parse(String(data)).type === "imageChanged") toolGotIt = true;
    });
    const gotImage = nextEvent(imageClient.ws, "imageChanged");
    const payload = { version: "1", timeStamp: 1, count: 1, id: 99 };
    generator.emit("imageChanged", payload);
    expect((await gotImage).data).toEqual(payload);
    await new Promise((r) => setTimeout(r, 20));
    expect(toolGotIt).toBe(false);

    const unsubscribed = await requestOnce(imageClient.ws, {
      id: "7",
      method: ProtocolMethod.EventUnsubscribe,
      params: { type: "imageChanged" },
    });
    expect(unsubscribed).toEqual({ id: "7", ok: true, result: { ok: true } });
    expect(generator.listeners.get("imageChanged")).toHaveLength(0);
  });

  it("rejects event subscription on plugin endpoints and unknown root event names", async () => {
    const { server: s } = await startRoot();
    const plugin = await connect(s.port, "echo");
    const pluginResponse = await requestOnce(plugin.ws, {
      id: "8",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    expect(pluginResponse).toMatchObject({
      id: "8",
      ok: false,
      error: { code: "BAD_REQUEST", message: "event subscription is only available on /ws" },
    });

    const root = await connectRoot(s.port);
    const unknown = await requestOnce(root.ws, {
      id: "9",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "nope" },
    });
    expect(unknown).toMatchObject({ id: "9", ok: false });
  });
});
