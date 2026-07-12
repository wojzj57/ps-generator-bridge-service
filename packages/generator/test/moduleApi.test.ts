import { afterEach, describe, expect, it } from "vitest";
import { ErrorCode } from "@ps-generator-bridge/sdk";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import {
  ActionModule,
  DocumentModule,
  ImageModule,
  LayerModule,
  SelectionModule,
} from "../src/modules";
import { createServer, type PsBridgeServer } from "../src/server";
import type { PsBridgeHost } from "../src/plugin";
import type { PsLayer } from "../src/modules/layer";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { JsxRunner } from "../src/utils/jsxRunner";
import { fakeGenerator, type FakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const BOUNDS = { left: 0, top: 0, right: 2, bottom: 2 };

let server: PsBridgeServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("built-in module HTTP APIs", () => {
  it("serves action routes with the same result shapes as WS methods", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = () => true;

    await expectJson(port, "/action/auto-cutout", { method: "POST" }, true);
    await expectJson(port, "/action/remove-background", { method: "POST" }, { success: true });
  });

  it("serves document routes with body params", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = documentAndLayerJsx;

    await expectJson(port, "/document/current", undefined, documentInfo());
    await expectJson(
      port,
      "/document/export",
      postJson({ filePath: "C:/tmp/out.png", format: "png" }),
      "OK"
    );
    await expectJson(port, "/document/save", postJson({ savePath: "C:/tmp/doc.psd" }), "OK");
  });

  it("serves layer query, path, preview, and import routes", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = documentAndLayerJsx;
    emitHappyPixmap(generator);

    await expectJson(port, "/layer/info?id=7&getChildren=true", undefined, layerInfo(7));
    await expectJson(port, "/layer/by-id/8?getChildren=false", undefined, layerInfo(8));
    await expectJson(port, "/layer/by-index/3?getChildren=true", undefined, layerInfo(30, 3));

    const preview = await fetchJson(port, "/layer/current-preview");
    expect(preview).toMatchObject({
      id: 7,
      name: "Layer 7",
      index: 1,
      width: 2,
      height: 2,
    });
    expect((preview as { data: string }).data.startsWith("data:image/png;base64,")).toBe(true);

    await expectJson(
      port,
      "/layer/import-image",
      postJson({ image: `data:image/png;base64,${PNG_BASE64}`, name: "Imported" }),
      layerInfo(33)
    );
  });

  it("serves image export and preview routes with wire-friendly image results", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = documentAndLayerJsx;
    generator.onGetDocumentPixmap = () =>
      makeDocPixmap({ left: 10, top: 20, right: 50, bottom: 60 }, 40, 40);
    emitHappyPixmap(generator, { left: 10, top: 20, right: 50, bottom: 60 }, 40, 40);

    for (const [path, init] of [
      ["/image/export-layer", postJson({ layerSpec: 7 })],
      ["/image/export-layer-with-selected-path", postJson({ layerSpec: 7, expand: 2 })],
      ["/image/export-document", postJson({})],
    ] as const) {
      const result = await fetchJson(port, path, init);
      expect(result).toMatchObject({
        bounds: { left: 10, top: 20, right: 50, bottom: 60 },
        width: 40,
        height: 40,
      });
      expect((result as { data: string }).data.startsWith("data:image/png;base64,")).toBe(true);
    }

    const preview = await fetchJson(port, "/image/preview/7?documentId=1");
    expect(preview).toMatchObject({
      bounds: { left: 10, top: 20, right: 50, bottom: 60 },
      width: 40,
      height: 40,
    });
    expect((preview as { data: string }).data.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("serves selection area and path routes", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = documentAndLayerJsx;

    await expectJson(port, "/selection/area", undefined, { x: 10, y: 20, width: 20, height: 30 });
    const path = await fetchJson(port, "/selection/path?expand=3");
    expect(path).toMatchObject({ x: 10, y: 20, width: 20, height: 30 });
    expect((path as { svg: string }).svg).toContain("<svg");
  });

  it("normalizes bad request errors for HTTP routes", async () => {
    const { port } = await startModuleServer();

    await expectError(port, "/document/export", postJson({}), 400, ErrorCode.BadRequest);
    await expectError(port, "/layer/by-id/not-a-number", undefined, 400, ErrorCode.BadRequest);
    await expectError(port, "/layer/import-image", postJson({}), 400, ErrorCode.BadRequest);
    await expectError(port, "/image/export-layer", postJson({}), 400, ErrorCode.BadRequest);
    await expectError(port, "/image/preview/nope", undefined, 400, ErrorCode.BadRequest);
    await expectError(port, "/selection/path?expand=nope", undefined, 400, ErrorCode.BadRequest);
  });

  it("preserves Fastify client errors as bad requests", async () => {
    const { port } = await startModuleServer();

    await expectError(
      port,
      "/document/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{broken",
      },
      400,
      ErrorCode.BadRequest
    );
  });

  it("normalizes JSX failures for HTTP routes", async () => {
    const { port, generator } = await startModuleServer();
    generator.onEvaluateJSXString = () => "Error:cutout failed";

    await expectError(port, "/action/auto-cutout", { method: "POST" }, 500, ErrorCode.JsxFailed);
  });
});

async function startModuleServer(): Promise<{ port: number; generator: FakeGenerator }> {
  const generator = fakeGenerator();
  const eventManager = new EventManager(generator);
  const runtimeEvents = new RuntimeEventManager(eventManager);
  const jsx = new JsxRunner(generator, silentLogger);
  const s = createServer({
    port: 0,
    generator,
    jsx,
    events: eventManager,
    runtimeEvents,
    logger: silentLogger,
  });

  const host = {
    config: {},
    generator,
    jsx,
    events: runtimeEvents.createPluginFacade("host"),
  } as unknown as PsBridgeHost;
  const action = new ActionModule(host);
  const document = new DocumentModule(host);
  document.currentDocument = documentInfo();
  const layer = new LayerModule(host);
  const image = new ImageModule(host);
  const selection = new SelectionModule(host);
  (host as unknown as { modules: PsBridgeHost["modules"] }).modules = {
    action,
    document,
    layer,
    image,
    selection,
  };

  for (const module of [action, document, layer, image, selection]) {
    bootstrap(module, s.registry);
  }

  await s.listen();
  server = s;
  return { port: s.port, generator };
}

function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function fetchJson(port: number, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`Expected 200 for ${path}, got ${response.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expectJson(
  port: number,
  path: string,
  init: RequestInit | undefined,
  expected: unknown
): Promise<void> {
  await expect(fetchJson(port, path, init)).resolves.toEqual(expected);
}

async function expectError(
  port: number,
  path: string,
  init: RequestInit | undefined,
  status: number,
  code: string
): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code });
}

function documentAndLayerJsx(script: string): unknown {
  if (script.includes("Save a Copy") || script.includes("Save the active document")) return "OK";
  if (script.includes("document.name") && script.includes("documentID")) return documentInfo();
  if (script.includes("addImageLayer")) return 33;
  if (script.includes("getSelectionAndPath")) {
    return JSON.stringify({
      path: [
        [
          { kind: "P", x: 10, y: 20 },
          { kind: "P", x: 30, y: 20 },
          { kind: "P", x: 30, y: 50 },
          { kind: "P", x: 10, y: 50 },
        ],
      ],
    });
  }
  if (script.includes("app.activeDocument.selection.bounds")) return "10 px, 20 px, 30 px, 50 px";
  if (script.includes("getLayerInfo")) {
    const params = jsxParams(script);
    const id =
      typeof params.layerID === "number"
        ? params.layerID
        : typeof params.layerIndex === "number"
          ? params.layerIndex * 10
          : 7;
    const index = typeof params.layerIndex === "number" ? params.layerIndex : 1;
    return layerInfo(id, index);
  }
  return true;
}

function documentInfo() {
  return {
    id: 1,
    name: "Doc.psd",
    width: 800,
    height: 600,
    resolution: 72,
    isDirty: false,
  };
}

function layerInfo(id: number, index = 1): PsLayer {
  return {
    id,
    index,
    name: `Layer ${id}`,
    type: 1,
    visible: true,
    clip: false,
    rect: { x: 10, y: 20, width: 40, height: 40 },
    bounds: { left: 10, top: 20, right: 50, bottom: 60 },
  } as PsLayer;
}

function jsxParams(script: string): Record<string, unknown> {
  const marker = "var params = ";
  const start = script.indexOf(marker);
  if (start === -1) return {};
  const valueStart = start + marker.length;
  const valueEnd = script.indexOf(";", valueStart);
  return JSON.parse(script.slice(valueStart, valueEnd)) as Record<string, unknown>;
}

function emitHappyPixmap(
  generator: FakeGenerator,
  bounds = BOUNDS,
  width?: number,
  height?: number
): void {
  generator.onSendJSXFile = (call) => {
    call.emitProgress({ type: "javascript", value: { bounds } });
    call.emitProgress({ type: "pixmap", value: makePixmapBuffer(width, height) });
  };
}

function makePixmapBuffer(width = 2, height = 2): Buffer {
  const channelCount = 4;
  const buf = Buffer.alloc(16 + width * height * channelCount);
  buf.writeUInt8(1, 0);
  buf.writeUInt32BE(width, 1);
  buf.writeUInt32BE(height, 5);
  buf.writeUInt32BE(width * channelCount, 9);
  buf.writeUInt8(1, 13);
  buf.writeUInt8(channelCount, 14);
  buf.writeUInt8(8, 15);
  for (let i = 0; i < width * height; i++) {
    const offset = 16 + i * channelCount;
    buf[offset] = 255;
    buf[offset + 1] = 10;
    buf[offset + 2] = 20;
    buf[offset + 3] = 30;
  }
  return buf;
}

function makeDocPixmap(bounds = BOUNDS, width = 2, height = 2): unknown {
  return {
    width,
    height,
    channelCount: 4,
    rowBytes: width * 4,
    pixels: makeRawPixels(width, height),
    bounds,
  };
}

function makeRawPixels(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 10;
    pixels[offset + 2] = 20;
    pixels[offset + 3] = 30;
  }
  return pixels;
}
