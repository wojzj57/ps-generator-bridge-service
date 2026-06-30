import { describe, it, expect } from "vitest";
import { Connection, DEFAULT_CONNECTION_URL } from "../src/publicConnection";
import { ProtocolMethod, type RequestEnvelope } from "../src/protocol";
import { FakeTransport } from "./fakeTransport";

const flush = () => Promise.resolve();

function harness() {
  const transports: FakeTransport[] = [];
  const conn = new Connection({
    transportFactory: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    retryDelayMs: 0,
    timeoutMs: 1000,
  });
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

describe("public Connection", () => {
  it("defaults to the root /ws URL and does not expose invoke", async () => {
    let capturedUrl = "";
    const conn = new Connection({
      transportFactory: (url) => {
        capturedUrl = url;
        return new FakeTransport();
      },
    });
    expect(capturedUrl).toBe(DEFAULT_CONNECTION_URL);
    expect("invoke" in conn).toBe(false);
    conn.close();
  });

  it("subscribes on first event listener and unsubscribes on the last off", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    const listener = () => undefined;
    conn.event.on("imageChanged", listener);
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.EventSubscribe);
    expect(lastRequest(transport).params).toEqual({ type: "imageChanged" });
    respond(transport, { ok: true });

    conn.event.off("imageChanged", listener);
    await flush();
    expect(lastRequest(transport).method).toBe(ProtocolMethod.EventUnsubscribe);
    expect(lastRequest(transport).params).toEqual({ type: "imageChanged" });
    respond(transport, { ok: true });
  });

  it("does not unsubscribe when off does not remove a listener", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;
    await connect(conn, transport);

    conn.event.off("imageChanged", () => undefined);
    await flush();
    expect(transport.sent).toHaveLength(0);
  });

  it("deduplicates subscription replay for listeners added before ready", async () => {
    const { conn, transports } = harness();
    const transport = transports[0]!;

    conn.event.on("imageChanged", () => undefined);
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
    conn.event.on("toolChanged", () => undefined);
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
