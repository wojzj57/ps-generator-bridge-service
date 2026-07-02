import { afterEach, describe, it, expect, vi } from "vitest";
import { Connection, DEFAULT_CONNECTION_URL, type ConnectionOptions } from "../src/publicConnection";
import { ProtocolMethod, type RequestEnvelope } from "../src/protocol";
import { FakeTransport } from "./fakeTransport";

const flush = () => Promise.resolve();

afterEach(() => {
  vi.unstubAllGlobals();
});

function harness(
  pluginIdOrOptions?: string | ConnectionOptions,
  options: ConnectionOptions = {}
) {
  const transports: FakeTransport[] = [];
  const baseOptions = {
    transportFactory: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    retryDelayMs: 0,
    timeoutMs: 1000,
  };
  const conn =
    typeof pluginIdOrOptions === "string"
      ? new Connection(pluginIdOrOptions, { ...baseOptions, ...options })
      : new Connection({ ...baseOptions, ...pluginIdOrOptions });
  return { conn, transports };
}

async function connect(conn: Connection, transport: FakeTransport, clientId = "root-1") {
  transport.emit(JSON.stringify({ type: "connected", data: { clientId } }));
  await conn.ready();
}

function lastRequest(transport: FakeTransport): RequestEnvelope {
  return transport.lastSent() as RequestEnvelope;
}

function respond(transport: FakeTransport, result: unknown): void {
  const req = lastRequest(transport);
  transport.emit(JSON.stringify({ id: req.id, ok: true, result }));
}

function responseJson(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    json: async () => body,
  } as Response;
}

function responseJsonError(error: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "",
    json: async () => {
      throw error;
    },
  } as unknown as Response;
}

function fetchHarness(response: Response) {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return response;
  };
  return { fetchImpl, urls };
}

describe("public Connection", () => {
  it("status fetches /health using the default HTTP base URL", async () => {
    const { fetchImpl, urls } = fetchHarness(responseJson({ status: "ok" }));

    await expect(Connection.status({ fetch: fetchImpl })).resolves.toEqual({
      ok: true,
      status: "ok",
    });
    expect(urls).toEqual(["http://127.0.0.1:7700/health"]);
  });

  it("status converts ws and wss base URLs to HTTP health URLs", async () => {
    const { fetchImpl, urls } = fetchHarness(responseJson({ status: "ok" }));

    await Connection.status({ url: "ws://host:7700", fetch: fetchImpl });
    await Connection.status({ url: "wss://secure:7700/", fetch: fetchImpl });

    expect(urls).toEqual(["http://host:7700/health", "https://secure:7700/health"]);
  });

  it("status returns ok false for fetch, HTTP, and malformed response failures", async () => {
    const fetchRejects: typeof fetch = async () => {
      throw new Error("offline");
    };
    const httpFailure = fetchHarness(responseJson({ status: "ok" }, { status: 503 }));
    const malformedJson = fetchHarness(responseJsonError(new Error("bad json")));
    const malformed = fetchHarness(responseJson({ status: "starting" }));

    await expect(Connection.status({ fetch: fetchRejects })).resolves.toMatchObject({
      ok: false,
    });
    await expect(Connection.status({ fetch: httpFailure.fetchImpl })).resolves.toMatchObject({
      ok: false,
    });
    await expect(Connection.status({ fetch: malformedJson.fetchImpl })).resolves.toMatchObject({
      ok: false,
    });
    await expect(Connection.status({ fetch: malformed.fetchImpl })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("plugins fetches /plugins and returns plugin info", async () => {
    const { fetchImpl, urls } = fetchHarness(responseJson({ plugins: [{ id: "paint" }] }));

    await expect(Connection.plugins({ fetch: fetchImpl })).resolves.toEqual([{ id: "paint" }]);
    expect(urls).toEqual(["http://127.0.0.1:7700/plugins"]);
  });

  it("plugins uses injected fetch and converts HTTP helper protocols", async () => {
    const { fetchImpl, urls } = fetchHarness(responseJson({ plugins: [] }));

    await Connection.plugins({ url: "https://host:7700/base/", fetch: fetchImpl });
    await Connection.plugins({ url: "ws://socket:7700", fetch: fetchImpl });

    expect(urls).toEqual(["https://host:7700/base/plugins", "http://socket:7700/plugins"]);
  });

  it("plugins throws ordinary errors for HTTP and malformed response failures", async () => {
    const fetchRejects: typeof fetch = async () => {
      throw "offline";
    };
    const httpFailure = fetchHarness(responseJson({ plugins: [] }, { status: 500 }));
    const malformedJson = fetchHarness(responseJsonError(new Error("bad json")));
    const malformedShape = fetchHarness(responseJson({ plugins: [{ name: "paint" }] }));

    await expect(Connection.plugins({ fetch: fetchRejects })).rejects.toThrow(/offline/);
    await expect(Connection.plugins({ fetch: httpFailure.fetchImpl })).rejects.toThrow(
      /HTTP 500/
    );
    await expect(Connection.plugins({ fetch: malformedJson.fetchImpl })).rejects.toThrow(
      /Malformed JSON/
    );
    await expect(Connection.plugins({ fetch: malformedShape.fetchImpl })).rejects.toThrow(
      /Malformed response/
    );
  });

  it("plugins throws an actionable error when fetch is unavailable", async () => {
    vi.stubGlobal("fetch", undefined);

    await expect(Connection.plugins()).rejects.toThrow(/pass options\.fetch/);
  });

  it("defaults to the root /ws endpoint and does not expose event facade", async () => {
    let capturedUrl = "";
    const conn = new Connection({
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });
    expect(DEFAULT_CONNECTION_URL).toBe("ws://127.0.0.1:7700");
    expect(capturedUrl).toBe("ws://127.0.0.1:7700/ws");
    expect(conn.endpoint).toEqual({ kind: "root" });
    expect("event" in conn).toBe(false);
    conn.close();
  });

  it("normalizes root base URLs to /ws endpoints", () => {
    let capturedUrl = "";
    const conn = new Connection({
      url: "http://host:7700/",
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });

    expect(capturedUrl).toBe("ws://host:7700/ws");
    expect(conn.endpoint).toEqual({ kind: "root" });
    conn.close();
  });

  it("connects plugin constructors to the default /ws/{pluginId} endpoint", () => {
    let capturedUrl = "";
    const conn = new Connection("paint", {
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });

    expect(capturedUrl).toBe("ws://127.0.0.1:7700/ws/paint");
    expect(conn.endpoint).toEqual({ kind: "plugin", pluginId: "paint" });
    conn.close();
  });

  it("normalizes plugin base URLs to /ws/{pluginId} endpoints", () => {
    let capturedUrl = "";
    const conn = new Connection("paint", {
      url: "https://host:7700",
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });

    expect(capturedUrl).toBe("wss://host:7700/ws/paint");
    expect(conn.endpoint).toEqual({ kind: "plugin", pluginId: "paint" });
    conn.close();
  });

  it("exposes clientId from the handshake without the old id getter", async () => {
    const { conn, transports } = harness("paint");
    await connect(conn, transports[0]!, "plugin-client-1");

    expect(conn.clientId).toBe("plugin-client-1");
    expect("id" in conn).toBe(false);
    // @ts-expect-error id was removed from public Connection.
    expect(conn.id).toBeUndefined();
  });

  it("exposes direct invoke for typed and custom ws methods", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const info = conn.invoke(ProtocolMethod.GetServerInfo, {});
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.GetServerInfo,
      params: {},
    });
    respond(transport, { name: "bridge", version: "1" });
    await expect(info).resolves.toEqual({ name: "bridge", version: "1" });

    const custom = conn.invoke<{ ok: true }>("paint:ping", { x: 1 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: "paint:ping",
      params: { x: 1 },
    });
    respond(transport, { ok: true });
    await expect(custom).resolves.toEqual({ ok: true });
  });

  it("subscribes on first event listener and unsubscribes on the last off", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const listener = () => undefined;
    conn.on("imageChanged", listener);
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transport).params).toEqual({ type: "imageChanged" });
    respond(transport, { ok: true });

    conn.off("imageChanged", listener);
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.EventUnsubscribe);
    expect(lastRequest(transport).params).toEqual({ type: "imageChanged" });
    respond(transport, { ok: true });
  });

  it("does not unsubscribe when off does not remove a listener", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    conn.off("imageChanged", () => undefined);
    await flush();
    expect(transport.sent).toHaveLength(0);
  });

  it("listens to custom events without server-side subscription", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    const listener = (data: unknown) => seen.push(data);
    conn.on("paint_changed", listener);
    await flush();
    expect(transport.sent).toHaveLength(0);

    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 1 } }));
    expect(seen).toEqual([{ id: 1 }]);

    conn.off("paint_changed", listener);
    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 2 } }));
    expect(seen).toEqual([{ id: 1 }]);
  });

  it("supports once for custom events", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    conn.once("paint_changed", (data) => seen.push(data));

    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 1 } }));
    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 2 } }));

    expect(seen).toEqual([{ id: 1 }]);
  });

  it("replaces an existing once wrapper for the same listener and event", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    const listener = (data: unknown) => seen.push(data);
    conn.once("paint_changed", listener);
    conn.once("paint_changed", listener);

    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 1 } }));
    transport.emit(JSON.stringify({ type: "paint_changed", data: { id: 2 } }));

    expect(seen).toEqual([{ id: 1 }]);
  });

  it("deduplicates subscription replay for listeners added before ready", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;

    conn.on("imageChanged", () => undefined);
    await connect(conn, transport);
    await flush();

    const requests = transport.sent.map((frame) => JSON.parse(frame) as RequestEnvelope);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: ProtocolMethod.EventSubscribe,
      params: { type: "imageChanged" },
    });
    respond(transport, { ok: true });
  });

  it("replays active subscriptions after reconnect", async () => {
    const { conn, transports } = harness();
    await connect(conn, transports[0]!);
    conn.on("toolChanged", () => undefined);
    await flush();
    respond(transports[0]!, { ok: true });

    transports[0]!.simulateClose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transports).toHaveLength(2);
    await connect(conn, transports[1]!, "root-1");
    await flush();
    expect(lastRequest(transports[1]!).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transports[1]!).params).toEqual({ type: "toolChanged" });
    respond(transports[1]!, { ok: true });
  });

  it("replays subscriptions after reconnect when the previous subscribe is pending", async () => {
    const { conn, transports } = harness();
    await connect(conn, transports[0]!);
    conn.on("imageChanged", () => undefined);
    await flush();
    expect(lastRequest(transports[0]!).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transports[0]!).params).toEqual({ type: "imageChanged" });

    transports[0]!.simulateClose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transports).toHaveLength(2);
    await connect(conn, transports[1]!, "root-1");
    await flush();

    expect(lastRequest(transports[1]!).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transports[1]!).params).toEqual({ type: "imageChanged" });
    respond(transports[0]!, { ok: true });
    respond(transports[1]!, { ok: true });
  });

  it("maps jsx run and execute onto protocol methods", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const run = conn.jsx.run("1 + 1");
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.JsxRun,
      params: { script: "1 + 1" },
    });
    respond(transport, 2);
    await expect(run).resolves.toBe(2);

    const exec = conn.jsx.execute("Document/getDocumentInfo", { id: 1 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.JsxExecute,
      params: { name: "Document/getDocumentInfo", params: { id: 1 } },
    });
    respond(transport, { id: 1 });
    await expect(exec).resolves.toEqual({ id: 1 });
  });

  it("powers the Photoshop proxy through jsx:run", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const name = conn.photoshop.activeDocument.name;
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.JsxRun);
    expect((lastRequest(transport).params as { script: string }).script).toContain(
      "app.activeDocument.name"
    );
    respond(transport, JSON.stringify("Design.psd"));
    await expect(name).resolves.toBe("Design.psd");
  });

  it("exposes plugin discovery and typed module wrappers", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const list = conn.plugin.list();
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.GetServerInfo);
    respond(transport, { name: "x", version: "1", plugins: [{ id: "paint" }] });
    await expect(list).resolves.toEqual([{ id: "paint" }]);

    const has = conn.plugin.has("paint");
    await flush();
    respond(transport, { name: "x", version: "1", plugins: [{ id: "paint" }] });
    await expect(has).resolves.toBe(true);

    const layer = conn.modules.layer.getLayerInfo({ id: 7 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.LayerGetInfo,
      params: { id: 7 },
    });
    respond(transport, { id: 7, index: 1, name: "Layer", type: 1, visible: true });
    await expect(layer).resolves.toMatchObject({ id: 7 });
  });

  it("exposes image module wrappers", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const bounds = { left: 0, top: 0, right: 10, bottom: 10 };

    const exportedLayer = conn.modules.image.exportLayer({
      documentId: 1,
      layerSpec: 7,
      settings: { scaleX: 0.5 },
    });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.ImageExportLayer,
      params: { documentId: 1, layerSpec: 7, settings: { scaleX: 0.5 } },
    });
    respond(transport, { data: "data:image/png;base64,abc", bounds, width: 10, height: 10 });
    await expect(exportedLayer).resolves.toMatchObject({ data: "data:image/png;base64,abc" });

    const preview = conn.modules.image.getPreview({ layerSpec: 7 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.ImageGetPreview,
      params: { layerSpec: 7 },
    });
    respond(transport, { data: "data:image/png;base64,thumb", bounds, width: 10, height: 10 });
    await expect(preview).resolves.toMatchObject({ width: 10, height: 10 });

    const exportedDocument = conn.modules.image.exportDocument({
      documentId: 1,
      settings: { scaleY: 0.25 },
    });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.ImageExportDocument,
      params: { documentId: 1, settings: { scaleY: 0.25 } },
    });
    respond(transport, { data: "https://cos/doc.png", bounds, width: 10, height: 10 });
    await expect(exportedDocument).resolves.toMatchObject({ data: "https://cos/doc.png" });
  });
});
