import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { MainEvent, ProtocolMethod } from "@ps-generator-bridge/sdk";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { SelectionModule } from "../src/modules/selection";
import { Registry } from "../src/server/registry";
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
  emitModuleEvent: ReturnType<typeof vi.fn>;
} {
  const app = Fastify({ logger: false });
  const registry = new Registry(app);
  const emitModuleEvent = vi.fn();
  const plugin = {
    generator,
    jsx: new JsxRunner(generator, silentLogger),
    emitModuleEvent,
    logger: silentLogger,
  } as unknown as PsBridgeHost;
  const module = new SelectionModule(plugin);
  bootstrap(module, registry);
  return { app, registry, module, emitModuleEvent };
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

  it("publishes selection:changed from Photoshop action messages", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
      if (script.includes("networkEventSubscribe")) return undefined;
      return "1 px, 2 px, 11 px, 22 px";
    };
    const { app, module, emitModuleEvent } = setup(generator);

    await module.start();
    generator._photoshop.emit("message", 1, "setd");
    await waitFor(() => emitModuleEvent.mock.calls.length > 0);
    module.dispose();
    await app.close();

    expect(emitModuleEvent).toHaveBeenCalledWith(MainEvent.SelectionChanged, {
      x: 1,
      y: 2,
      width: 10,
      height: 20,
    });
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
