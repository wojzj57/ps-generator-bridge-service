import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MainEvent,
  ProtocolMethod,
  type LayerPreviewPayload,
  type LayerSelectionChangePayload,
} from "@ps-generator-bridge/sdk";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { LayerModule } from "../src/modules/layer";
import { Registry } from "../src/server/registry";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import type { PsBridgeHost } from "../src/plugin";
import type { PsGenerator } from "../src/types/generator";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const BOUNDS = { left: 0, top: 0, right: 2, bottom: 2 };
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");

function setup(
  generator: PsGenerator,
  config: Record<string, unknown> = {}
): {
  app: FastifyInstance;
  registry: Registry;
  module: LayerModule;
  runtimeEvents: RuntimeEventManager;
  imageGetPreview: ReturnType<typeof vi.fn>;
} {
  const app = Fastify({ logger: false });
  const runtimeEvents = new RuntimeEventManager(new EventManager(generator));
  const registry = new Registry(app, runtimeEvents);
  const imageGetPreview = vi.fn(async () => ({
    buffer: Buffer.from("png"),
    bounds: BOUNDS,
    width: 12,
    height: 8,
  }));
  const plugin = {
    config,
    generator,
    jsx: new JsxRunner(generator, silentLogger),
    events: runtimeEvents.createPluginFacade("host"),
    modules: {
      image: { getPreview: imageGetPreview },
    },
  } as unknown as PsBridgeHost;
  const module = new LayerModule(plugin);
  (plugin as PsBridgeHost).modules.layer = module;
  bootstrap(module, registry);
  return { app, registry, module, runtimeEvents, imageGetPreview };
}

function layer(
  init: Partial<{
    id: number;
    index: number;
    name: string;
    width: number;
    height: number;
  }>
) {
  const width = init.width ?? 100;
  const height = init.height ?? 80;
  return {
    id: init.id ?? 7,
    index: init.index ?? 1,
    name: init.name ?? "Layer",
    type: 1,
    visible: true,
    clip: false,
    rect: { x: 0, y: 0, width, height },
    bounds: { left: 0, top: 0, right: width, bottom: height },
  };
}

function jsxParams(script: string): Record<string, any> {
  const marker = "var params = ";
  const start = script.indexOf(marker);
  if (start === -1) return {};
  const valueStart = start + marker.length;
  const valueEnd = script.indexOf(";", valueStart);
  return JSON.parse(script.slice(valueStart, valueEnd));
}

function isAddImageScript(script: string): boolean {
  return script.includes("function addImageLayer");
}

function isTransformScript(script: string): boolean {
  return script.includes("function transformLayer");
}

function isWorkpathMaskScript(script: string): boolean {
  return script.includes("function workpathToSelection");
}

function isGetLayerInfoScript(script: string): boolean {
  return script.includes("function getLayerInfoByID");
}

describe("LayerModule current preview", () => {
  it("layer:getCurrentPreview generates and returns the current layer preview", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => layer({ id: 7, index: 1, name: "Hero" });
    const { app, registry, runtimeEvents, imageGetPreview } = setup(generator);

    const res = await registry.dispatch(
      { id: "preview", method: ProtocolMethod.LayerGetCurrentPreview, params: {} },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toMatchObject({
      id: "preview",
      ok: true,
      result: {
        id: 7,
        name: "Hero",
        index: 1,
        width: 12,
        height: 8,
        data: "data:image/png;base64,cG5n",
      },
    });
    expect(imageGetPreview).toHaveBeenCalledWith({ layerSpec: 7 });
  });

  it("layer:getCurrentPreview returns null for an empty current layer", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => layer({ id: 7, width: 0, height: 0 });
    const { app, registry, runtimeEvents, imageGetPreview } = setup(generator);

    const res = await registry.dispatch(
      { id: "empty", method: ProtocolMethod.LayerGetCurrentPreview, params: {} },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toEqual({ id: "empty", ok: true, result: null });
    expect(imageGetPreview).not.toHaveBeenCalled();
  });

  it("publishes layer:previewChange from the first selected layer after mapping index to layerIndex", async () => {
    vi.useFakeTimers();
    try {
      const generator = fakeGenerator();
      generator.onEvaluateJSXString = (script) => {
        if (script.includes('"layerIndex":2')) {
          return layer({ id: 9, index: 2, name: "Selected" });
        }
        return layer({ id: 7, index: 1, name: "Layer" });
      };
      const { app, runtimeEvents, imageGetPreview } = setup(generator);
      const seen: LayerPreviewPayload[] = [];
      runtimeEvents.mainScope.on(MainEvent.LayerPreviewChange, (payload) =>
        seen.push(payload as LayerPreviewPayload)
      );

      await runtimeEvents.ensureSubscribable(MainEvent.LayerPreviewChange);
      generator.emit("imageChanged", {
        version: "1.6.1",
        timeStamp: 1,
        count: 1,
        id: 59,
        selection: [1, 2],
        metaDataOnly: true,
      });
      await vi.waitFor(() => {
        expect(generator.jsxStringCalls.length).toBeGreaterThan(0);
      });
      await vi.advanceTimersByTimeAsync(300);
      await vi.waitFor(() => {
        expect(seen.length).toBeGreaterThan(0);
      });
      runtimeEvents.dispose();
      await app.close();

      expect(seen[0]).toMatchObject({
        id: 9,
        name: "Selected",
        index: 2,
        width: 12,
        height: 8,
        data: "data:image/png;base64,cG5n",
      });
      expect(generator.jsxStringCalls[0]?.script).toContain('"layerIndex":2');
      expect(imageGetPreview).toHaveBeenCalledWith({ layerSpec: 9 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes layer:previewChange when the current layer pixels change", async () => {
    vi.useFakeTimers();
    try {
      const generator = fakeGenerator();
      generator.onEvaluateJSXString = () => layer({ id: 3, index: 1, name: "Paint" });
      const { app, runtimeEvents, imageGetPreview } = setup(generator);
      const seen: LayerPreviewPayload[] = [];
      runtimeEvents.mainScope.on(MainEvent.LayerPreviewChange, (payload) =>
        seen.push(payload as LayerPreviewPayload)
      );

      await runtimeEvents.ensureSubscribable(MainEvent.LayerPreviewChange);
      generator.emit("imageChanged", {
        version: "1.6.1",
        timeStamp: 1,
        count: 1,
        id: 59,
        layers: [{ id: 3, pixels: true }],
      });
      await vi.waitFor(() => {
        expect(generator.jsxStringCalls.length).toBeGreaterThan(0);
      });
      await vi.advanceTimersByTimeAsync(300);
      await vi.waitFor(() => {
        expect(seen.length).toBeGreaterThan(0);
      });
      runtimeEvents.dispose();
      await app.close();

      expect(seen[0]).toMatchObject({
        id: 3,
        name: "Paint",
        index: 1,
        width: 12,
        height: 8,
      });
      expect(imageGetPreview).toHaveBeenCalledWith({ layerSpec: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LayerModule image import", () => {
  it("imports data URI images above a layer id, transforms with completed rect, masks, and returns layer info", async () => {
    const generator = fakeGenerator();
    const addParams: Record<string, any>[] = [];
    const transformParams: Record<string, any>[] = [];
    const workpathParams: Record<string, any>[] = [];

    generator.onEvaluateJSXString = (script) => {
      const params = jsxParams(script);
      if (isGetLayerInfoScript(script)) {
        if (params.layerID === 11) return layer({ id: 11, index: 4, name: "Anchor" });
        if (params.layerID === 33) {
          return layer({ id: 33, index: 5, name: "Imported", width: 40, height: 30 });
        }
      }
      if (isAddImageScript(script)) {
        addParams.push(params);
        expect(existsSync(params.filePath)).toBe(true);
        return 33;
      }
      if (isTransformScript(script)) {
        transformParams.push(params);
        return undefined;
      }
      if (isWorkpathMaskScript(script)) {
        workpathParams.push(params);
        return undefined;
      }
      return undefined;
    };

    const { app, registry, runtimeEvents } = setup(generator);
    const res = await registry.dispatch(
      {
        id: "import",
        method: ProtocolMethod.LayerImportImage,
        params: {
          image: `data:image/png;base64,${PNG_BASE64}`,
          name: "Imported",
          position: { x: 10, y: 20 },
          useWorkpath: true,
          layerId: 11,
        },
      },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toMatchObject({
      id: "import",
      ok: true,
      result: { id: 33, index: 5, name: "Imported" },
    });
    expect(addParams[0]).toMatchObject({
      name: "Imported",
      insertIndex: 5,
    });
    expect(existsSync(addParams[0]!.filePath)).toBe(false);
    expect(transformParams[0]).toMatchObject({
      id: 33,
      rect: { x: 10, y: 20, width: 40, height: 30 },
    });
    expect(workpathParams[0]).toMatchObject({ id: 33, blur: 10 });
  });

  it("imports raw base64 images above a layer index and completes size-only transforms", async () => {
    const generator = fakeGenerator();
    const addParams: Record<string, any>[] = [];
    const transformParams: Record<string, any>[] = [];

    generator.onEvaluateJSXString = (script) => {
      const params = jsxParams(script);
      if (isAddImageScript(script)) {
        addParams.push(params);
        expect(existsSync(params.filePath)).toBe(true);
        return 44;
      }
      if (isGetLayerInfoScript(script) && params.layerID === 44) {
        return {
          ...layer({ id: 44, index: 3, name: "Sized", width: 40, height: 30 }),
          rect: { x: 3, y: 4, width: 40, height: 30 },
        };
      }
      if (isTransformScript(script)) {
        transformParams.push(params);
        return undefined;
      }
      return undefined;
    };

    const { app, registry, runtimeEvents } = setup(generator);
    const res = await registry.dispatch(
      {
        id: "import-b64",
        method: ProtocolMethod.LayerImportImage,
        params: {
          image: PNG_BASE64,
          size: { width: 12, height: 8 },
          layerIndex: 2,
        },
      },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toMatchObject({ id: "import-b64", ok: true, result: { id: 44 } });
    expect(addParams[0]).toMatchObject({ insertIndex: 3 });
    expect(existsSync(addParams[0]!.filePath)).toBe(false);
    expect(transformParams[0]).toMatchObject({
      id: 44,
      rect: { x: 3, y: 4, width: 12, height: 8 },
    });
  });

  it("imports file URI images without deleting the source file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-bridge-layer-test-"));
    const filePath = join(dir, "source.png");
    writeFileSync(filePath, PNG_BYTES);
    try {
      const generator = fakeGenerator();
      const addParams: Record<string, any>[] = [];
      generator.onEvaluateJSXString = (script) => {
        const params = jsxParams(script);
        if (isAddImageScript(script)) {
          addParams.push(params);
          return 55;
        }
        if (isGetLayerInfoScript(script) && params.layerID === 55) {
          return layer({ id: 55, index: 1, name: "Local" });
        }
        return undefined;
      };

      const { app, registry, runtimeEvents } = setup(generator);
      const res = await registry.dispatch(
        {
          id: "import-file",
          method: ProtocolMethod.LayerImportImage,
          params: {
            image: pathToFileURL(filePath).toString(),
            name: "Local",
          },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({ id: "import-file", ok: true, result: { id: 55 } });
      expect(addParams[0]).toMatchObject({ filePath, name: "Local" });
      expect(existsSync(filePath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects local files that are not decodable images before calling Photoshop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-bridge-layer-test-"));
    const filePath = join(dir, "source.png");
    writeFileSync(filePath, Buffer.from("not an image"));
    try {
      const generator = fakeGenerator();
      const { app, registry, runtimeEvents } = setup(generator);

      const res = await registry.dispatch(
        {
          id: "bad-local",
          method: ProtocolMethod.LayerImportImage,
          params: { image: filePath },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({
        id: "bad-local",
        ok: false,
        error: { code: "BAD_REQUEST", message: "image data is not a supported image format" },
      });
      expect(generator.jsxStringCalls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects local files with unsupported extensions before calling Photoshop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-bridge-layer-test-"));
    const filePath = join(dir, "source.txt");
    writeFileSync(filePath, PNG_BYTES);
    try {
      const generator = fakeGenerator();
      const { app, registry, runtimeEvents } = setup(generator);

      const res = await registry.dispatch(
        {
          id: "bad-extension",
          method: ProtocolMethod.LayerImportImage,
          params: { image: filePath },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({
        id: "bad-extension",
        ok: false,
        error: { code: "BAD_REQUEST", message: "image file extension is not allowed" },
      });
      expect(generator.jsxStringCalls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can disable local image paths through PluginConfig", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-bridge-layer-test-"));
    const filePath = join(dir, "source.png");
    writeFileSync(filePath, PNG_BYTES);
    try {
      const generator = fakeGenerator();
      const { app, registry, runtimeEvents } = setup(generator, {
        allowLocalImagePaths: false,
      });

      const res = await registry.dispatch(
        {
          id: "local-disabled",
          method: ProtocolMethod.LayerImportImage,
          params: { image: filePath },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({
        id: "local-disabled",
        ok: false,
        error: { code: "BAD_REQUEST", message: "local image paths are disabled" },
      });
      expect(generator.jsxStringCalls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects decoded base64 images over the configured byte limit", async () => {
    const generator = fakeGenerator();
    const { app, registry, runtimeEvents } = setup(generator, { maxImportImageBytes: 2 });

    const res = await registry.dispatch(
      {
        id: "too-large-base64",
        method: ProtocolMethod.LayerImportImage,
        params: { image: PNG_BASE64 },
      },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toMatchObject({
      id: "too-large-base64",
      ok: false,
      error: { code: "BAD_REQUEST", message: "image exceeds max size of 2 bytes" },
    });
    expect(generator.jsxStringCalls).toHaveLength(0);
  });

  it("rejects HTTP images with unsupported content types before reading the body", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(PNG_BYTES, { headers: { "content-type": "text/plain" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const generator = fakeGenerator();
      const { app, registry, runtimeEvents } = setup(generator);

      const res = await registry.dispatch(
        {
          id: "bad-content-type",
          method: ProtocolMethod.LayerImportImage,
          params: { image: "https://example.com/source.png" },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({
        id: "bad-content-type",
        ok: false,
        error: { code: "BAD_REQUEST", message: "image content-type is not allowed" },
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(generator.jsxStringCalls).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects HTTP images whose content length exceeds the configured byte limit", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(PNG_BYTES, {
        headers: { "content-type": "image/png", "content-length": "3" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const generator = fakeGenerator();
      const { app, registry, runtimeEvents } = setup(generator, { maxImportImageBytes: 2 });

      const res = await registry.dispatch(
        {
          id: "too-large-http",
          method: ProtocolMethod.LayerImportImage,
          params: { image: "https://example.com/source.png" },
        },
        { generator }
      );
      runtimeEvents.dispose();
      await app.close();

      expect(res).toMatchObject({
        id: "too-large-http",
        ok: false,
        error: { code: "BAD_REQUEST", message: "image exceeds max size of 2 bytes" },
      });
      expect(generator.jsxStringCalls).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects imports with both layerId and layerIndex", async () => {
    const generator = fakeGenerator();
    const { app, registry, runtimeEvents } = setup(generator);

    const res = await registry.dispatch(
      {
        id: "conflict",
        method: ProtocolMethod.LayerImportImage,
        params: {
          image: "data:image/png;base64,cG5n",
          layerId: 1,
          layerIndex: 2,
        },
      },
      { generator }
    );
    runtimeEvents.dispose();
    await app.close();

    expect(res).toMatchObject({
      id: "conflict",
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expect(generator.jsxStringCalls).toHaveLength(0);
  });
});

describe("LayerModule selection change", () => {
  it("publishes layer:selectionChange with layer info after mapping indices to layerIndex", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
      if (script.includes('"layerIndex":3')) return layer({ id: 20, index: 3, name: "Second" });
      if (script.includes('"layerIndex":6')) return layer({ id: 50, index: 6, name: "Fifth" });
      return layer({ id: 7, index: 1, name: "Layer" });
    };
    const { app, runtimeEvents } = setup(generator);
    const seen: LayerSelectionChangePayload[] = [];
    runtimeEvents.mainScope.on(MainEvent.LayerSelectionChange, (payload) =>
      seen.push(payload as LayerSelectionChangePayload)
    );

    await runtimeEvents.ensureSubscribable(MainEvent.LayerSelectionChange);
    generator.emit("imageChanged", {
      version: "1.6.1",
      timeStamp: 1,
      count: 1,
      id: 59,
      selection: [2, 5],
      metaDataOnly: true,
    });
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    runtimeEvents.dispose();
    await app.close();

    expect(seen[0]).toMatchObject([
      { id: 20, index: 3, name: "Second" },
      { id: 50, index: 6, name: "Fifth" },
    ]);
    expect(generator.jsxStringCalls).toHaveLength(2);
    expect(generator.jsxStringCalls[0]?.script).toContain('"layerIndex":3');
    expect(generator.jsxStringCalls[1]?.script).toContain('"layerIndex":6');
  });

  it("publishes null for empty layer selection changes", async () => {
    const generator = fakeGenerator();
    const { app, runtimeEvents } = setup(generator);
    const seen: LayerSelectionChangePayload[] = [];
    runtimeEvents.mainScope.on(MainEvent.LayerSelectionChange, (payload) =>
      seen.push(payload as LayerSelectionChangePayload)
    );

    await runtimeEvents.ensureSubscribable(MainEvent.LayerSelectionChange);
    generator.emit("imageChanged", {
      version: "1.6.1",
      timeStamp: 1,
      count: 1,
      id: 59,
      selection: [],
      metaDataOnly: true,
    });
    await vi.waitFor(() => {
      expect(seen).toEqual([null]);
    });
    runtimeEvents.dispose();
    await app.close();

    expect(generator.jsxStringCalls).toHaveLength(0);
  });
});
