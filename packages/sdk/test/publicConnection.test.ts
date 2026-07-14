import { afterEach, describe, it, expect, vi } from "vitest";
import {
  Connection,
  DEFAULT_CONNECTION_URL,
  type ConnectionOptions,
} from "../src/publicConnection";
import { MainEvent, ProtocolMethod, type RequestEnvelope } from "../src/protocol";
import { FakeTransport } from "./fakeTransport";

const flush = () => Promise.resolve();

afterEach(() => {
  vi.unstubAllGlobals();
});

function harness(pluginIdOrOptions?: string | ConnectionOptions, options: ConnectionOptions = {}) {
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

function responseJson(
  body: unknown,
  init: { status?: number; statusText?: string } = {}
): Response {
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
    await expect(Connection.plugins({ fetch: httpFailure.fetchImpl })).rejects.toThrow(/HTTP 500/);
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

  it("pluginHealth fetches /plugins/{id}/health and returns plugin health", async () => {
    const health = {
      id: "paint",
      status: "loaded",
      clients: 2,
      loadedAt: 123,
      checks: { runtime: "ok" },
    };
    const { fetchImpl, urls } = fetchHarness(responseJson(health));

    await expect(Connection.pluginHealth("paint tool", { fetch: fetchImpl })).resolves.toEqual(
      health
    );
    expect(urls).toEqual(["http://127.0.0.1:7700/plugins/paint%20tool/health"]);
  });

  it("pluginHealth uses injected fetch and converts HTTP helper protocols", async () => {
    const { fetchImpl, urls } = fetchHarness(
      responseJson({ id: "paint", status: "loaded", clients: 0 })
    );

    await Connection.pluginHealth("paint", { url: "https://host:7700/base/", fetch: fetchImpl });
    await Connection.pluginHealth("paint", { url: "ws://socket:7700", fetch: fetchImpl });

    expect(urls).toEqual([
      "https://host:7700/base/plugins/paint/health",
      "http://socket:7700/plugins/paint/health",
    ]);
  });

  it("pluginHealth throws ordinary errors for HTTP and malformed response failures", async () => {
    const httpFailure = fetchHarness(responseJson({}, { status: 404 }));
    const malformedJson = fetchHarness(responseJsonError(new Error("bad json")));
    const malformedShape = fetchHarness(responseJson({ id: "paint", status: "loaded" }));

    await expect(
      Connection.pluginHealth("paint", { fetch: httpFailure.fetchImpl })
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      Connection.pluginHealth("paint", { fetch: malformedJson.fetchImpl })
    ).rejects.toThrow(/Malformed JSON/);
    await expect(
      Connection.pluginHealth("paint", { fetch: malformedShape.fetchImpl })
    ).rejects.toThrow(/Malformed response/);
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
    expect("plugin" in conn).toBe(false);
    // @ts-expect-error plugin facade was removed from public Connection.
    expect(conn.plugin).toBeUndefined();
    conn.close();
  });

  it("preserves endpoint-capable instance surfaces on root and plugin connections", () => {
    const root = harness().conn;
    const plugin = harness("paint").conn;

    for (const conn of [root, plugin]) {
      expect(typeof conn.invoke).toBe("function");
      expect(typeof conn.ready).toBe("function");
      expect(typeof conn.close).toBe("function");
      expect(typeof conn.on).toBe("function");
      expect(typeof conn.once).toBe("function");
      expect(typeof conn.off).toBe("function");
      expect(typeof conn.jsx.run).toBe("function");
      expect(typeof conn.jsx.execute).toBe("function");
      expect(conn.photoshop).toBeDefined();
      expect(conn.modules).toBeDefined();
      expect("plugin" in conn).toBe(false);
      conn.close();
    }
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

  it("passes an initial clientId to plugin endpoint connections", () => {
    let capturedUrl = "";
    const conn = new Connection("paint", {
      clientId: "editor:primary",
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });

    const url = new URL(capturedUrl);
    expect(url.pathname).toBe("/ws/paint");
    expect(url.searchParams.get("clientId")).toBe("editor:primary");
    conn.close();
  });

  it("manually reconnects with the current clientId and replays subscriptions", async () => {
    const { conn, transports } = harness("paint", { clientId: "plugin-client-1" });
    await connect(conn, transports[0]!, "plugin-client-1");
    conn.on("paint:changed", () => undefined);
    await flush();
    respond(transports[0]!, { ok: true });

    const reconnected = conn.reconnect();
    expect(transports[0]!.closed).toBe(true);
    expect(transports).toHaveLength(2);
    await connect(conn, transports[1]!, "plugin-client-1");
    await expect(reconnected).resolves.toBeUndefined();
    await flush();

    expect(lastRequest(transports[1]!)).toMatchObject({
      method: ProtocolMethod.EventSubscribe,
      params: { type: "paint:changed" },
    });
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

  it("subscribes main and plugin event names through the protocol", async () => {
    for (const type of [MainEvent.Ready, "paint:changed"]) {
      const { conn, transports } = harness();
      const transport = transports[0]!;
      await connect(conn, transport);

      conn.on(type, () => undefined);
      await flush();

      expect(lastRequest(transport)).toMatchObject({
        method: ProtocolMethod.EventSubscribe,
        params: { type },
      });
      respond(transport, { ok: true });
      conn.close();
    }
  });

  it("does not subscribe twice for multiple listeners on the same event", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    conn.on("paint:changed", () => undefined);
    await flush();
    expect(transport.sent).toHaveLength(1);

    conn.on("paint:changed", () => undefined);
    await flush();
    expect(transport.sent).toHaveLength(1);
  });

  it("does not unsubscribe until the last listener is removed", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const first = () => undefined;
    const second = () => undefined;
    conn.on("paint:changed", first);
    conn.on("paint:changed", second);
    await flush();
    respond(transport, { ok: true });

    conn.off("paint:changed", first);
    await flush();
    expect(transport.sent).toHaveLength(1);

    conn.off("paint:changed", second);
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.EventUnsubscribe,
      params: { type: "paint:changed" },
    });
  });

  it("does not unsubscribe when off does not remove a listener", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    conn.off("imageChanged", () => undefined);
    await flush();
    expect(transport.sent).toHaveLength(0);
  });

  it("listens to custom events after server-side subscription", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    const listener = (data: unknown) => seen.push(data);
    conn.on("paint:changed", listener);
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.EventSubscribe,
      params: { type: "paint:changed" },
    });
    respond(transport, { ok: true });

    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 1 } }));
    expect(seen).toEqual([{ id: 1 }]);

    conn.off("paint:changed", listener);
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.EventUnsubscribe,
      params: { type: "paint:changed" },
    });

    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 2 } }));
    expect(seen).toEqual([{ id: 1 }]);
  });

  it("supports once for custom events", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    conn.once("paint:changed", (data) => seen.push(data));
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.EventSubscribe,
      params: { type: "paint:changed" },
    });

    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 1 } }));
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.EventUnsubscribe,
      params: { type: "paint:changed" },
    });
    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 2 } }));

    expect(seen).toEqual([{ id: 1 }]);
  });

  it("replaces an existing once wrapper for the same listener and event", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const seen: unknown[] = [];
    const listener = (data: unknown) => seen.push(data);
    conn.once("paint:changed", listener);
    conn.once("paint:changed", listener);

    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 1 } }));
    transport.emit(JSON.stringify({ type: "paint:changed", data: { id: 2 } }));

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
    conn.on("paint:changed", () => undefined);
    await flush();
    respond(transports[0]!, { ok: true });

    transports[0]!.simulateClose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transports).toHaveLength(2);
    await connect(conn, transports[1]!, "root-1");
    await flush();
    expect(lastRequest(transports[1]!).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transports[1]!).params).toEqual({ type: "paint:changed" });
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

  it("maps every built-in module wrapper to its protocol method", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const layerResult = { id: 7, index: 1, name: "Layer", type: 1, visible: true };
    const documentResult = {
      id: 1,
      name: "Design.psd",
      width: 100,
      height: 100,
      resolution: 72,
      isDirty: false,
    };
    const imageResult = {
      data: "data:image/png;base64,abc",
      bounds: { left: 0, top: 0, right: 10, bottom: 10 },
      width: 10,
      height: 10,
    };
    const selectionPathResult = { svg: "<svg></svg>", x: 1, y: 2, width: 3, height: 4 };
    const cases: Array<{
      call: () => Promise<unknown>;
      method: ProtocolMethod;
      params: unknown;
      result: unknown;
    }> = [
      {
        call: () => conn.modules.action.autoCutout(),
        method: ProtocolMethod.ActionAutoCutout,
        params: {},
        result: true,
      },
      {
        call: () => conn.modules.action.removeBackground(),
        method: ProtocolMethod.ActionRemoveBackground,
        params: {},
        result: { success: true },
      },
      {
        call: () => conn.modules.document.getCurrentDocument(),
        method: ProtocolMethod.DocumentCurrent,
        params: {},
        result: documentResult,
      },
      {
        call: () => conn.modules.document.exportDocument({ filePath: "out.png", quality: 90 }),
        method: ProtocolMethod.DocumentExport,
        params: { filePath: "out.png", quality: 90 },
        result: { ok: true },
      },
      {
        call: () => conn.modules.document.saveDocument({ savePath: "out.psd" }),
        method: ProtocolMethod.DocumentSave,
        params: { savePath: "out.psd" },
        result: { ok: true },
      },
      {
        call: () => conn.modules.layer.getLayerInfo({ id: 7, getChildren: true }),
        method: ProtocolMethod.LayerGetInfo,
        params: { id: 7, getChildren: true },
        result: layerResult,
      },
      {
        call: () => conn.modules.layer.getLayerInfo({ selection: 1 }),
        method: ProtocolMethod.LayerGetInfo,
        params: { selection: 1 },
        result: layerResult,
      },
      {
        call: () => conn.modules.layer.getLayerInfoByID(7, { getChildren: true }),
        method: ProtocolMethod.LayerGetInfoById,
        params: { layerID: 7, options: { getChildren: true } },
        result: layerResult,
      },
      {
        call: () => conn.modules.layer.getLayerInfoByIndex(2, { getChildren: false }),
        method: ProtocolMethod.LayerGetInfoByIndex,
        params: { layerIndex: 2, options: { getChildren: false } },
        result: layerResult,
      },
      {
        call: () => conn.modules.layer.getLayerInfoBySelectionIndex(1, { getChildren: false }),
        method: ProtocolMethod.LayerGetInfoBySelectionIndex,
        params: { selection: 1, options: { getChildren: false } },
        result: layerResult,
      },
      {
        call: () => conn.modules.layer.getCurrentPreview(),
        method: ProtocolMethod.LayerGetCurrentPreview,
        params: {},
        result: { id: 7, name: "Layer", index: 1, width: 12, height: 8, data: "preview" },
      },
      {
        call: () => conn.modules.layer.importImage({ image: "data:image/png;base64,cG5n" }),
        method: ProtocolMethod.LayerImportImage,
        params: { image: "data:image/png;base64,cG5n" },
        result: layerResult,
      },
      {
        call: () => conn.modules.image.exportLayer({ layerSpec: 7, settings: { scaleX: 0.5 } }),
        method: ProtocolMethod.ImageExportLayer,
        params: { layerSpec: 7, settings: { scaleX: 0.5 } },
        result: imageResult,
      },
      {
        call: () => conn.modules.image.exportLayerWithSelectedPath({ layerSpec: 7, expand: 2 }),
        method: ProtocolMethod.ImageExportLayerWithSelectedPath,
        params: { layerSpec: 7, expand: 2 },
        result: imageResult,
      },
      {
        call: () => conn.modules.image.getPreview({ layerSpec: 7 }),
        method: ProtocolMethod.ImageGetPreview,
        params: { layerSpec: 7 },
        result: imageResult,
      },
      {
        call: () => conn.modules.image.exportDocument({ documentId: 1 }),
        method: ProtocolMethod.ImageExportDocument,
        params: { documentId: 1 },
        result: imageResult,
      },
      {
        call: () => conn.modules.selection.watch(),
        method: ProtocolMethod.SelectionWatch,
        params: {},
        result: { ok: true },
      },
      {
        call: () => conn.modules.selection.getArea(),
        method: ProtocolMethod.SelectionGetArea,
        params: {},
        result: { x: 1, y: 2, width: 3, height: 4 },
      },
      {
        call: () => conn.modules.selection.getPath({ expand: 2 }),
        method: ProtocolMethod.SelectionGetPath,
        params: { expand: 2 },
        result: selectionPathResult,
      },
    ];

    for (const item of cases) {
      const promise = item.call();
      await flush();
      expect(lastRequest(transport)).toMatchObject({
        method: item.method,
        params: item.params,
      });
      respond(transport, item.result);
      await expect(promise).resolves.toEqual(item.result);
    }
  });

  it("exposes typed module wrappers", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const layer = conn.modules.layer.getLayerInfo({ id: 7 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.LayerGetInfo,
      params: { id: 7 },
    });
    respond(transport, { id: 7, index: 1, name: "Layer", type: 1, visible: true });
    await expect(layer).resolves.toMatchObject({ id: 7 });

    const preview = conn.modules.layer.getCurrentPreview();
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.LayerGetCurrentPreview,
      params: {},
    });
    respond(transport, {
      id: 7,
      name: "Layer",
      index: 1,
      width: 12,
      height: 8,
      data: "data:image/png;base64,abc",
    });
    await expect(preview).resolves.toMatchObject({ width: 12, height: 8 });

    const imported = conn.modules.layer.importImage({
      image: "data:image/png;base64,cG5n",
      name: "Imported",
    });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.LayerImportImage,
      params: { image: "data:image/png;base64,cG5n", name: "Imported" },
    });
    respond(transport, { id: 8, index: 2, name: "Imported", type: 1, visible: true });
    await expect(imported).resolves.toMatchObject({ id: 8, name: "Imported" });
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

    const exportedLayerWithPath = conn.modules.image.exportLayerWithSelectedPath({
      documentId: 1,
      layerSpec: 7,
      expand: 12,
    });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.ImageExportLayerWithSelectedPath,
      params: { documentId: 1, layerSpec: 7, expand: 12 },
    });
    respond(transport, { data: "data:image/png;base64,path", bounds, width: 10, height: 10 });
    await expect(exportedLayerWithPath).resolves.toMatchObject({
      data: "data:image/png;base64,path",
    });

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

  it("exposes selection module wrappers", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const watch = conn.modules.selection.watch();
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.SelectionWatch,
      params: {},
    });
    respond(transport, { ok: true });
    await expect(watch).resolves.toEqual({ ok: true });

    const area = conn.modules.selection.getArea();
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.SelectionGetArea,
      params: {},
    });
    respond(transport, { x: 1, y: 2, width: 3, height: 4 });
    await expect(area).resolves.toEqual({ x: 1, y: 2, width: 3, height: 4 });

    const path = conn.modules.selection.getPath({ expand: 2 });
    await flush();
    expect(lastRequest(transport)).toMatchObject({
      method: ProtocolMethod.SelectionGetPath,
      params: { expand: 2 },
    });
    respond(transport, { svg: "<svg></svg>", x: 1, y: 2, width: 3, height: 4 });
    await expect(path).resolves.toMatchObject({ svg: "<svg></svg>" });
  });
});
