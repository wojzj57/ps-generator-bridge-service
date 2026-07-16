import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { ErrorCode, MainEvent, ProtocolMethod, SessionCloseCode } from "@ps-generator-bridge/sdk";
import { createServer, type PsBridgeServer } from "../src/server";
import {
  BasePlugin,
  ws,
  api,
  bootstrap,
  type PluginHost,
  type PluginInitContext,
  type WsHandlerContext,
} from "@ps-generator-bridge/sdk/plugin";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
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
  @ws("echo:ping")
  ping(params: { n?: number }): { pong: number } {
    return { pong: params?.n ?? 0 };
  }

  @ws("echo:context")
  context(_params: unknown, context: WsHandlerContext): unknown {
    return {
      clientId: context.clientId,
      sessionClientId: context.session.clientId,
      endpoint: context.session.endpoint,
    };
  }

  @api("/status")
  async status(): Promise<{ ok: true }> {
    return { ok: true };
  }

  publish(type: string, data: unknown): boolean {
    return this.events.emit(type, data);
  }
}

class LifecycleEchoService extends EchoService {
  readonly lifecycle: string[] = [];

  override onConnect(clientId: string): void {
    this.lifecycle.push(`connect:${clientId}`);
  }

  override onDisconnect(clientId: string): void {
    this.lifecycle.push(`disconnect:${clientId}`);
  }
}

class FaultyLifecycleService extends EchoService {
  failConnect = false;
  failDisconnect = false;
  readonly connectAttempts: string[] = [];
  readonly disconnectAttempts: string[] = [];

  override onConnect(clientId: string): void {
    this.connectAttempts.push(clientId);
    if (this.failConnect) throw new Error("connect exploded");
  }

  override onDisconnect(clientId: string): void {
    this.disconnectAttempts.push(clientId);
    if (this.failDisconnect) throw new Error("disconnect exploded");
  }
}

class BrokenRegistrationService extends BasePlugin {
  disposeCalls = 0;

  @api("/partial")
  first(): { handler: string } {
    return { handler: "first" };
  }

  @api("/partial")
  duplicate(): { handler: string } {
    return { handler: "duplicate" };
  }

  override onDispose(): void {
    this.disposeCalls += 1;
    throw new Error("registration cleanup exploded");
  }
}

class DisposeService extends EchoService {
  constructor(
    context: PluginInitContext,
    private readonly disposed: string[],
    private readonly shouldThrow = false
  ) {
    super(context);
  }

  override onDispose(): void {
    this.disposed.push(this.pluginId);
    if (this.shouldThrow) throw new Error("dispose exploded");
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
type PluginFixture = BasePlugin | ((events: RuntimeEventManager) => BasePlugin);

function createPluginServer(sessionResumeTtlMs?: number): {
  server: PsBridgeServer;
  events: RuntimeEventManager;
} {
  const generator = fakeGenerator();
  const events = new RuntimeEventManager(new EventManager(generator));
  return {
    server: createServer({
      port: 0,
      generator,
      runtimeEvents: events,
      logger: silentLogger,
      sessionResumeTtlMs,
    }),
    events,
  };
}

async function start(...plugins: PluginFixture[]): Promise<PsBridgeServer> {
  return startWithTtl(undefined, ...plugins);
}

async function startWithTtl(
  sessionResumeTtlMs: number | undefined,
  ...plugins: PluginFixture[]
): Promise<PsBridgeServer> {
  const { server: s, events } = createPluginServer(sessionResumeTtlMs);
  for (const svc of plugins) {
    const runtime = typeof svc === "function" ? svc(events) : svc;
    await s.pluginManager.register({ pluginId: runtime.pluginId, runtime });
  }
  await s.listen();
  server = s;
  return s;
}

const pluginContext = (pluginId: string, host: PluginHost): PluginInitContext =>
  ({ pluginId, host, ws() {}, api() {} }) as PluginInitContext;

const echo = (events?: RuntimeEventManager, id = "echo") =>
  new EchoService(
    pluginContext(id, {
      events: events?.createPluginFacade(id),
    } as unknown as PluginHost)
  );

async function startRoot(): Promise<{
  server: PsBridgeServer;
  generator: FakeGenerator;
  events: RuntimeEventManager;
}> {
  const generator = fakeGenerator();
  const eventManager = new EventManager(generator);
  const events = new RuntimeEventManager(eventManager);
  const s = createServer({
    port: 0,
    generator,
    jsx: new JsxRunner(generator, silentLogger),
    events: eventManager,
    runtimeEvents: events,
    logger: silentLogger,
  });
  const runtime = echo(events);
  await s.pluginManager.register({ pluginId: runtime.pluginId, runtime });
  bootstrap(new GreetModule(), s.registry);
  await s.listen();
  server = s;
  return { server: s, generator, events };
}

/** Connect to /ws/{pluginId} and resolve once the `connected` handshake arrives. */
function connect(
  port: number,
  pluginId: string,
  resume?: string
): Promise<{ ws: WebSocket; clientId: string }> {
  const url = new URL(`ws://127.0.0.1:${port}/ws/${pluginId}`);
  if (resume !== undefined) url.searchParams.set("resume", resume);
  return connectUrl(url);
}

function connectUrl(url: string | URL): Promise<{ ws: WebSocket; clientId: string }> {
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
function firstFrame(
  port: number,
  pluginId: string
): Promise<{
  ws: WebSocket;
  frame: any;
  closed: Promise<{ code: number; reason: string }>;
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${pluginId}`);
  openSockets.push(ws);
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: String(reason) }));
  });
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve({ ws, frame: JSON.parse(String(data)), closed }));
  });
}

/** Connect to root /ws and resolve once the `connected` handshake arrives. */
function connectRoot(port: number, resume?: string): Promise<{ ws: WebSocket; clientId: string }> {
  const url = new URL(`ws://127.0.0.1:${port}/ws`);
  if (resume !== undefined) url.searchParams.set("resume", resume);
  return connectUrl(url);
}

function closed(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.once("close", () => resolve()));
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

  it("allows browser clients from any origin to fetch /health", async () => {
    const s = await start();
    const origin = "http://localhost:6010";
    const response = await fetch(`http://127.0.0.1:${s.port}/health`, {
      headers: { Origin: origin },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("GET /plugins lists registered plugins", async () => {
    const s = await start(echo());
    const response = await fetch(`http://127.0.0.1:${s.port}/plugins`);
    expect(await response.json()).toEqual({ plugins: [{ id: "echo" }] });
  });

  it("GET /plugins/{id}/health reports loaded plugin health and client count", async () => {
    const s = await start(echo());
    await connect(s.port, "echo");

    const response = await fetch(`http://127.0.0.1:${s.port}/plugins/echo/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "echo",
      status: "loaded",
      clients: 1,
      checks: { runtime: "ok" },
    });
    expect(typeof body.loadedAt).toBe("number");
  });

  it("GET /plugins/{id}/health reports failed plugin diagnostics", async () => {
    const s = await start();
    s.pluginManager.recordFailure({
      id: "broken",
      lastError: {
        code: ErrorCode.PluginLoadFailed,
        message: "plugin load failed: broken",
        details: { pluginId: "broken", reason: "boom" },
        source: "plugin",
      },
    });

    const response = await fetch(`http://127.0.0.1:${s.port}/plugins/broken/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "broken",
      status: "failed",
      clients: 0,
      lastError: {
        code: ErrorCode.PluginLoadFailed,
        message: "plugin load failed: broken",
        details: { pluginId: "broken", reason: "boom" },
        source: "plugin",
      },
      checks: { load: "failed" },
    });
  });

  it("isolates registration failure and guards partially registered routes", async () => {
    const created = createPluginServer();
    const s = created.server;
    server = s;
    const broken = new BrokenRegistrationService(
      pluginContext("broken", {
        events: created.events.createPluginFacade("broken"),
      } as unknown as PluginHost)
    );

    const failed = await s.pluginManager.register({ pluginId: broken.pluginId, runtime: broken });
    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error("expected broken plugin registration to fail");
    expect(failed.error).toMatchObject({
      code: ErrorCode.PluginRegistrationFailed,
      pluginId: "broken",
      details: { pluginId: "broken", phase: "registration" },
      source: "plugin",
      retryable: false,
    });
    expect(broken.disposeCalls).toBe(1);

    const goodRuntime = echo(created.events);
    const good = await s.pluginManager.register({
      pluginId: goodRuntime.pluginId,
      runtime: goodRuntime,
    });
    expect(good.ok).toBe(true);
    await s.listen();

    const plugins = await fetch(`http://127.0.0.1:${s.port}/plugins`);
    await expect(plugins.json()).resolves.toEqual({ plugins: [{ id: "echo" }] });

    const health = await fetch(`http://127.0.0.1:${s.port}/plugins/broken/health`);
    await expect(health.json()).resolves.toMatchObject({
      id: "broken",
      status: "failed",
      clients: 0,
      lastError: failed.error,
      checks: { load: "ok", registration: "failed" },
    });

    const partial = await fetch(`http://127.0.0.1:${s.port}/broken/partial`);
    // Duplicate routes are rejected in the staging registry before anything is
    // committed to Fastify, so no partial route remains reachable.
    expect(partial.status).toBe(404);

    const unavailable = await firstFrame(s.port, "broken");
    expect(unavailable.frame).toEqual({ type: "error", data: failed.error });
    await expect(unavailable.closed).resolves.toMatchObject({ code: 1011 });

    const { ws } = await connect(s.port, "echo");
    await expect(
      requestOnce(ws, { id: "still-up", method: "echo:ping", params: { n: 9 } })
    ).resolves.toEqual({ id: "still-up", ok: true, result: { pong: 9 } });
  });

  it("GET /plugins/{id}/health returns PLUGIN_NOT_FOUND for unknown plugins", async () => {
    const s = await start(echo());

    const response = await fetch(`http://127.0.0.1:${s.port}/plugins/nope/health`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: ErrorCode.PluginNotFound,
      pluginId: "nope",
    });
  });

  it("sends a connected handshake with a generated clientId on /ws/{id}", async () => {
    const s = await start(echo());
    const { clientId } = await connect(s.port, "echo");
    expect(clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("ignores freely supplied ids and treats invalid resume values as new connections", async () => {
    const s = await start(echo());
    const supplied = await connectUrl(
      `ws://127.0.0.1:${s.port}/ws/echo?id=fixed-id&clientId=fixed-client`
    );
    const invalidResume = await connect(s.port, "echo", "fixed-resume");
    const unknownResumeId = "00000000-0000-4000-8000-000000000000";
    const unknownResume = await connect(s.port, "echo", unknownResumeId);

    expect(supplied.clientId).not.toBe("fixed-id");
    expect(supplied.clientId).not.toBe("fixed-client");
    expect(invalidResume.clientId).not.toBe("fixed-resume");
    expect(invalidResume.clientId).not.toBe(supplied.clientId);
    expect(unknownResume.clientId).not.toBe(unknownResumeId);
  });

  it("dispatches a scoped @ws method on /ws/{id}", async () => {
    const s = await start(echo());
    const { ws } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "1", method: "echo:ping", params: { n: 7 } });
    expect(response).toEqual({ id: "1", ok: true, result: { pong: 7 } });
  });

  it("passes the server-issued clientId and public session to @ws handlers", async () => {
    const s = await start(echo());
    const { ws, clientId } = await connect(s.port, "echo");
    const response = await requestOnce(ws, { id: "context", method: "echo:context", params: {} });

    expect(response).toEqual({
      id: "context",
      ok: true,
      result: {
        clientId,
        sessionClientId: clientId,
        endpoint: { kind: "plugin", pluginId: "echo" },
      },
    });
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

  it("delivers plugin events only to subscribed clients of the plugin", async () => {
    const s = await start((events) => echo(events));
    const a = await connect(s.port, "echo");
    const b = await connect(s.port, "echo");
    await requestOnce(a.ws, {
      id: "sub-a",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    await requestOnce(b.ws, {
      id: "sub-b",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    const gotA = nextEvent(a.ws, "ping");
    const gotB = nextEvent(b.ws, "ping");
    (s.pluginManager.get("echo")!.runtime as EchoService).publish("ping", { n: 1 });
    expect((await gotA).data).toEqual({ n: 1 });
    expect((await gotB).data).toEqual({ n: 1 });
  });

  it("does not deliver plugin events to unsubscribed clients", async () => {
    const s = await start((events) => echo(events));
    const a = await connect(s.port, "echo", "client-a");
    const b = await connect(s.port, "echo", "client-b");
    await requestOnce(a.ws, {
      id: "sub-a",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "hey" },
    });
    let bGotIt = false;
    b.ws.on("message", (data) => {
      if (JSON.parse(String(data)).type === "hey") bGotIt = true;
    });
    const gotA = nextEvent(a.ws, "hey");
    (s.pluginManager.get("echo")!.runtime as EchoService).publish("hey", {
      only: "subscribed",
    });
    expect((await gotA).data).toEqual({ only: "subscribed" });
    await new Promise((r) => setTimeout(r, 20));
    expect(bGotIt).toBe(false);
  });

  it("plugin events do not leak to a different plugin's clients", async () => {
    const s = await start(
      (events) => echo(events),
      (events) => echo(events, "other")
    );
    const echoClient = await connect(s.port, "echo");
    const otherClient = await connect(s.port, "other");
    await requestOnce(echoClient.ws, {
      id: "sub-echo",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    await requestOnce(otherClient.ws, {
      id: "sub-other",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    let otherGotIt = false;
    otherClient.ws.on("message", (data) => {
      if (JSON.parse(String(data)).type === "ping") otherGotIt = true;
    });
    const gotEcho = nextEvent(echoClient.ws, "ping");
    (s.pluginManager.get("echo")!.runtime as EchoService).publish("ping", { n: 2 });
    expect((await gotEcho).data).toEqual({ n: 2 });
    await new Promise((r) => setTimeout(r, 20));
    expect(otherGotIt).toBe(false);
  });

  it("resumes the session atomically, closes the stale socket, and requires subscription replay", async () => {
    let plugin!: LifecycleEchoService;
    const s = await start((events) => {
      plugin = new LifecycleEchoService(
        pluginContext("echo", {
          events: events.createPluginFacade("echo"),
        } as unknown as PluginHost)
      );
      return plugin;
    });
    const first = await connect(s.port, "echo");
    await requestOnce(first.ws, {
      id: "sub",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    const oldClosed = closed(first.ws);
    const second = await connect(s.port, "echo", first.clientId);
    await oldClosed; // old socket was closed by the takeover
    expect(second.clientId).toBe(first.clientId);
    expect(plugin.lifecycle).toEqual([`connect:${first.clientId}`]);

    await requestOnce(second.ws, {
      id: "replay-sub",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "ping" },
    });
    const got = nextEvent(second.ws, "ping");
    plugin.publish("ping", { n: 3 });
    expect((await got).data).toEqual({ n: 3 });
  });

  it("keeps unexpected disconnects resumable but disposes explicitly closed sessions", async () => {
    let plugin!: LifecycleEchoService;
    const s = await start((events) => {
      plugin = new LifecycleEchoService(
        pluginContext("echo", {
          events: events.createPluginFacade("echo"),
        } as unknown as PluginHost)
      );
      return plugin;
    });
    const first = await connect(s.port, "echo");
    const firstClosed = closed(first.ws);
    first.ws.terminate();
    await firstClosed;
    expect(plugin.lifecycle).toEqual([`connect:${first.clientId}`]);

    const resumed = await connect(s.port, "echo", first.clientId);
    expect(resumed.clientId).toBe(first.clientId);
    expect(plugin.lifecycle).toEqual([`connect:${first.clientId}`]);

    const resumedClosed = closed(resumed.ws);
    resumed.ws.close(SessionCloseCode.Dispose, "session-dispose");
    await resumedClosed;
    await expect
      .poll(() => plugin.lifecycle)
      .toEqual([`connect:${first.clientId}`, `disconnect:${first.clientId}`]);

    const afterDispose = await connect(s.port, "echo", first.clientId);
    expect(afterDispose.clientId).not.toBe(first.clientId);
  });

  it("rejects only the connection whose plugin onConnect fails", async () => {
    let plugin!: FaultyLifecycleService;
    const s = await start((events) => {
      plugin = new FaultyLifecycleService(
        pluginContext("echo", {
          events: events.createPluginFacade("echo"),
        } as unknown as PluginHost)
      );
      return plugin;
    });
    const existing = await connect(s.port, "echo");
    plugin.failConnect = true;

    const rejected = await firstFrame(s.port, "echo");
    expect(rejected.frame).toMatchObject({
      type: "error",
      data: {
        code: ErrorCode.PluginLifecycleFailed,
        pluginId: "echo",
        details: { pluginId: "echo", phase: "onConnect", reason: "connect exploded" },
      },
    });
    await expect(rejected.closed).resolves.toEqual({
      code: 1011,
      reason: "plugin-onConnect-failed",
    });
    expect(plugin.connectAttempts).toHaveLength(2);
    expect(plugin.disconnectAttempts).toEqual([]);

    await expect(
      requestOnce(existing.ws, { id: "existing", method: "echo:ping", params: { n: 4 } })
    ).resolves.toEqual({ id: "existing", ok: true, result: { pong: 4 } });

    const health = await fetch(`http://127.0.0.1:${s.port}/plugins/echo/health`);
    await expect(health.json()).resolves.toMatchObject({
      id: "echo",
      status: "loaded",
      clients: 1,
      checks: { runtime: "failed" },
      lastError: {
        code: ErrorCode.PluginLifecycleFailed,
        details: { phase: "onConnect" },
      },
    });
  });

  it("contains onDisconnect failures from active-close and resume-TTL paths", async () => {
    let plugin!: FaultyLifecycleService;
    const s = await startWithTtl(10, (events) => {
      plugin = new FaultyLifecycleService(
        pluginContext("echo", {
          events: events.createPluginFacade("echo"),
        } as unknown as PluginHost)
      );
      plugin.failDisconnect = true;
      return plugin;
    });

    const active = await connect(s.port, "echo");
    const activeClosed = closed(active.ws);
    active.ws.close(SessionCloseCode.Dispose, "session-dispose");
    await activeClosed;
    await expect.poll(() => plugin.disconnectAttempts).toEqual([active.clientId]);

    const expiring = await connect(s.port, "echo");
    const expiringClosed = closed(expiring.ws);
    expiring.ws.terminate();
    await expiringClosed;
    await expect
      .poll(() => plugin.disconnectAttempts)
      .toEqual([active.clientId, expiring.clientId]);

    const health = await fetch(`http://127.0.0.1:${s.port}/plugins/echo/health`);
    await expect(health.json()).resolves.toMatchObject({
      status: "loaded",
      clients: 0,
      checks: { runtime: "failed" },
      lastError: {
        code: ErrorCode.PluginLifecycleFailed,
        details: { phase: "onDisconnect", reason: "disconnect exploded" },
      },
    });
  });

  it("expires an unexpectedly disconnected session after the configured TTL", async () => {
    let plugin!: LifecycleEchoService;
    const s = await startWithTtl(10, (events) => {
      plugin = new LifecycleEchoService(
        pluginContext("echo", {
          events: events.createPluginFacade("echo"),
        } as unknown as PluginHost)
      );
      return plugin;
    });
    const first = await connect(s.port, "echo");
    const firstClosed = closed(first.ws);
    first.ws.terminate();
    await firstClosed;
    await expect
      .poll(() => plugin.lifecycle)
      .toEqual([`connect:${first.clientId}`, `disconnect:${first.clientId}`]);
    const afterExpiry = await connect(s.port, "echo", first.clientId);
    expect(afterExpiry.clientId).not.toBe(first.clientId);
  });

  it("sends an error frame and closes on an unknown plugin id", async () => {
    const s = await start(echo());
    const { frame, closed: socketClosed } = await firstFrame(s.port, "nope");
    expect(frame.type).toBe("error");
    expect(frame.data.code).toBe("PLUGIN_NOT_FOUND");
    expect(frame.data.pluginId).toBe("nope");
    await socketClosed;
  });

  it("continues host disposal after one plugin onDispose throws", async () => {
    const created = createPluginServer();
    const s = created.server;
    server = s;
    const disposed: string[] = [];
    const host = (id: string) =>
      ({ events: created.events.createPluginFacade(id) }) as unknown as PluginHost;

    const recorder = new DisposeService(pluginContext("recorder", host("recorder")), disposed);
    const thrower = new DisposeService(pluginContext("thrower", host("thrower")), disposed, true);
    await s.pluginManager.register({ pluginId: recorder.pluginId, runtime: recorder });
    await s.pluginManager.register({ pluginId: thrower.pluginId, runtime: thrower });

    await s.close();
    server = undefined;
    expect(disposed).toEqual(["thrower", "recorder"]);
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
  it("handshakes with a server-issued id, resumes it, and dispatches global methods only", async () => {
    const { server: s } = await startRoot();
    const first = await connectRoot(s.port);
    const firstClosed = closed(first.ws);
    first.ws.terminate();
    await firstClosed;
    const { ws, clientId } = await connectRoot(s.port, first.clientId);
    expect(clientId).toBe(first.clientId);

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
    generator.onEvaluateJSXString = (script) => (script === "2 + 2" ? 4 : { ok: true });
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
    expect(generator.jsxStringCalls[1]?.script).toContain('var params = {"id":1};');
    expect(generator.jsxStringCalls[1]?.script).toContain("documentID");
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

  it("releases remote subscriptions when a client finally disconnects", async () => {
    const { server: s, generator } = await startRoot();
    const imageClient = await connectRoot(s.port, "image-client");

    await requestOnce(imageClient.ws, {
      id: "release-sub",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    expect(generator.listeners.get("imageChanged")).toHaveLength(1);

    const closed = new Promise<void>((resolve) => imageClient.ws.once("close", () => resolve()));
    imageClient.ws.close();
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(generator.listeners.get("imageChanged")).toHaveLength(0);
  });

  it("releases old subscriptions immediately when a live session is resumed", async () => {
    const { server: s, generator } = await startRoot();
    const first = await connectRoot(s.port);
    await requestOnce(first.ws, {
      id: "takeover-sub",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    expect(generator.listeners.get("imageChanged")).toHaveLength(1);

    const firstClosed = closed(first.ws);
    const resumed = await connectRoot(s.port, first.clientId);
    await firstClosed;

    expect(resumed.clientId).toBe(first.clientId);
    expect(generator.listeners.get("imageChanged")).toHaveLength(0);
  });

  it("supports endpoint-aware event subscriptions and rejects root plugin events", async () => {
    const { server: s, generator, events } = await startRoot();
    const plugin = await connect(s.port, "echo");
    const pluginPhotoshop = await requestOnce(plugin.ws, {
      id: "8",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    expect(pluginPhotoshop).toEqual({ id: "8", ok: true, result: { ok: true } });

    const gotPluginImage = nextEvent(plugin.ws, "imageChanged");
    const imagePayload = { version: "1", timeStamp: 1, count: 1, id: 100 };
    generator.emit("imageChanged", imagePayload);
    expect((await gotPluginImage).data).toEqual(imagePayload);

    const pluginMain = await requestOnce(plugin.ws, {
      id: "9",
      method: ProtocolMethod.EventSubscribe,
      params: { type: MainEvent.Ready },
    });
    expect(pluginMain).toEqual({ id: "9", ok: true, result: { ok: true } });
    const gotPluginReady = nextEvent(plugin.ws, MainEvent.Ready);
    events.emitMain(MainEvent.Ready, { port: s.port, plugins: [{ id: "echo" }] });
    expect((await gotPluginReady).data).toEqual({ port: s.port, plugins: [{ id: "echo" }] });

    const root = await connectRoot(s.port);
    const rootMain = await requestOnce(root.ws, {
      id: "10",
      method: ProtocolMethod.EventSubscribe,
      params: { type: MainEvent.Ready },
    });
    expect(rootMain).toEqual({ id: "10", ok: true, result: { ok: true } });

    const rootSelection = await requestOnce(root.ws, {
      id: "10b",
      method: ProtocolMethod.EventSubscribe,
      params: { type: MainEvent.SelectionChanged },
    });
    expect(rootSelection).toEqual({ id: "10b", ok: true, result: { ok: true } });
    const gotSelection = nextEvent(root.ws, MainEvent.SelectionChanged);
    events.emitMain(MainEvent.SelectionChanged, { x: 1, y: 2, width: 3, height: 4 });
    expect((await gotSelection).data).toEqual({ x: 1, y: 2, width: 3, height: 4 });

    const rootPluginEvent = await requestOnce(root.ws, {
      id: "11",
      method: ProtocolMethod.EventSubscribe,
      params: { type: "paint:changed" },
    });
    expect(rootPluginEvent).toMatchObject({
      id: "11",
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
  });
});
