import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { MainEvent, ProtocolMethod } from "@ps-generator-bridge/sdk";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { SelectionModule } from "../src/modules/selection";
import { Registry } from "../src/server/registry";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import type { PsBridgeHost } from "../src/plugin";
import type { PsGenerator } from "../src/types/generator";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

function setup(generator: PsGenerator): {
  app: FastifyInstance;
  registry: Registry;
  module: SelectionModule;
  runtimeEvents: RuntimeEventManager;
} {
  const app = Fastify({ logger: false });
  const runtimeEvents = new RuntimeEventManager(new EventManager(generator));
  const registry = new Registry(app, runtimeEvents);
  const emitModuleEvent = vi.fn();
  const plugin = {
    generator,
    jsx: new JsxRunner(generator, silentLogger),
    events: runtimeEvents.createPluginFacade("host"),
    emitModuleEvent,
    logger: silentLogger,
  } as unknown as PsBridgeHost;
  const module = new SelectionModule(plugin);
  bootstrap(module, registry);
  return { app, registry, module, runtimeEvents };
}

describe("SelectionModule", () => {
  it("selection:getArea returns the current selection rectangle", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "10 px, 20 px, 30 px, 55 px";
    const { app, registry } = setup(generator);

    const res = await registry.dispatch(
      { id: "1", method: ProtocolMethod.SelectionGetArea, params: {} },
      { generator }
    );
    await app.close();

    expect(res).toEqual({
      id: "1",
      ok: true,
      result: { x: 10, y: 20, width: 20, height: 35 },
    });
  });

  it("selection:getPath converts Photoshop path data to SVG metadata", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
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
      return "10 px, 20 px, 30 px, 50 px";
    };
    const { app, registry } = setup(generator);

    const res = await registry.dispatch(
      { id: "2", method: ProtocolMethod.SelectionGetPath, params: { expand: 3 } },
      { generator }
    );
    await app.close();

    expect(res).toMatchObject({
      id: "2",
      ok: true,
      result: { x: 10, y: 20, width: 20, height: 30 },
    });
    const result = res && res.ok ? (res.result as { svg: string }) : undefined;
    expect(result?.svg).toContain('<path fill-rule="evenodd"');
    expect(generator.jsxStringCalls.at(-1)?.script).toContain('"expand":3');
  });

  it("watches selection changes through the explicit ws method", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
      if (script.includes("networkEventSubscribe")) return undefined;
      return "1 px, 2 px, 11 px, 22 px";
    };
    const { app, registry, runtimeEvents } = setup(generator);
    const seen: unknown[] = [];
    runtimeEvents.mainScope.on(MainEvent.SelectionChanged, (payload) => seen.push(payload));

    const watched = await registry.dispatch(
      { id: "watch", method: ProtocolMethod.SelectionWatch, params: {} },
      { generator }
    );
    generator._photoshop.emit("message", 1, "setd");
    await waitFor(() => seen.length > 0);
    runtimeEvents.dispose();
    await app.close();

    expect(watched).toEqual({ id: "watch", ok: true, result: { ok: true } });
    expect(seen[0]).toEqual({
      x: 1,
      y: 2,
      width: 10,
      height: 20,
    });
  });

  it("registers selection watch only once and retries after a failure", async () => {
    const generator = fakeGenerator();
    let attempts = 0;
    generator.onEvaluateJSXString = (script) => {
      if (!script.includes("networkEventSubscribe")) return null;
      attempts += 1;
      if (attempts === 1) throw new Error("register failed");
      return undefined;
    };
    const { app, module, runtimeEvents } = setup(generator);

    await expect(module.watchSelection()).rejects.toThrow("register failed");
    await expect(module.watchSelection()).resolves.toEqual({ ok: true });
    await expect(module.watchSelection()).resolves.toEqual({ ok: true });
    runtimeEvents.dispose();
    await app.close();

    expect(attempts).toBe(2);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
