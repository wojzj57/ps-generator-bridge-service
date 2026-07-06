import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
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

function setup(generator: PsGenerator): {
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

  it("publishes layer:previewChange from the first selected layer index after debounce", async () => {
    vi.useFakeTimers();
    try {
      const generator = fakeGenerator();
      generator.onEvaluateJSXString = () => layer({ id: 9, index: 1, name: "Selected" });
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
        index: 1,
        width: 12,
        height: 8,
        data: "data:image/png;base64,cG5n",
      });
      expect(generator.jsxStringCalls[0]?.script).toContain('"layerIndex":1');
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

describe("LayerModule selection change", () => {
  it("publishes layer:selectionChange with layer info for each selected index", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
      if (script.includes('"layerIndex":2')) return layer({ id: 20, index: 2, name: "Second" });
      if (script.includes('"layerIndex":5')) return layer({ id: 50, index: 5, name: "Fifth" });
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
      { id: 20, index: 2, name: "Second" },
      { id: 50, index: 5, name: "Fifth" },
    ]);
    expect(generator.jsxStringCalls).toHaveLength(2);
    expect(generator.jsxStringCalls[0]?.script).toContain('"layerIndex":2');
    expect(generator.jsxStringCalls[1]?.script).toContain('"layerIndex":5');
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