import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { Registry } from "../src/server/registry";
import { ActionModule } from "../src/modules/action";
import { JsxRunner } from "../src/utilis/jsxRunner";
import type { Logger } from "../src/utilis/logger";
import type { PsBridgeHost } from "../src/plugin";
import type { PsGenerator } from "../src/types/generator";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

// ActionModule only reaches Photoshop through `plugin.jsx`, so a fake plugin
// carrying a JsxRunner over the FakeGenerator is enough — no real server. Same
// pattern as plugin.test.ts's BaseModule test (a cast fake plugin) combined with
// the registry dispatch tests.
function setup(generator: PsGenerator): Registry {
  app = Fastify({ logger: false });
  const registry = new Registry(app);
  const plugin = { jsx: new JsxRunner(generator, silentLogger) } as unknown as PsBridgeHost;
  bootstrap(new ActionModule(plugin), registry);
  return registry;
}

describe("ActionModule", () => {
  it("action:autoCutout runs the cutout jsx and resolves true", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => true;
    const registry = setup(generator);

    const res = await registry.dispatch(
      { id: "1", method: ProtocolMethod.ActionAutoCutout, params: {} },
      { generator }
    );

    expect(res).toMatchObject({ id: "1", ok: true, result: true });
    expect(generator.jsxStringCalls).toHaveLength(1);
    expect(generator.jsxStringCalls[0]?.script).toContain("JSON.stringify");
    expect(generator.jsxStringCalls[0]?.script).not.toContain("ok: true");
  });

  it("action:removeBackground wraps the jsx result as { success }", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => true;
    const registry = setup(generator);

    const res = await registry.dispatch(
      { id: "2", method: ProtocolMethod.ActionRemoveBackground, params: {} },
      { generator }
    );

    expect(res).toMatchObject({ id: "2", ok: true, result: { success: true } });
    expect(generator.jsxStringCalls).toHaveLength(1);
  });

  it("surfaces a jsx failure as a JSX_FAILED response", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "Error:cutout failed";
    const registry = setup(generator);

    const res = await registry.dispatch(
      { id: "3", method: ProtocolMethod.ActionAutoCutout, params: {} },
      { generator }
    );

    expect(res).toMatchObject({
      id: "3",
      ok: false,
      error: { code: "JSX_FAILED", message: "cutout failed", source: "jsx" },
    });
  });
});
