import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { ErrorCode, MainEvent } from "@ps-generator-bridge/sdk";
import { PsBridgeHost } from "../src/plugin";
import { BaseModule } from "../src/modules/base";
import { LayerModule, DocumentModule, ActionModule, SelectionModule } from "../src/modules";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { PluginHost } from "@ps-generator-bridge/sdk/plugin";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const SDK_PLUGIN = resolve(__dirname, "../../sdk/dist/plugin.cjs");

// vitest runs source directly, so JsxRunner's __dirname-based default
// (package-root jsx/polyfills from the bundled dist) doesn't exist — point init() at the source tree so
// polyfill priming works in the integration test.
const SOURCE_POLYFILLS = join(__dirname, "..", "jsx", "polyfills");

let plugin: PsBridgeHost | undefined;

async function writePluginPackage(path: string, id: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({ name: `@fixture/${id}`, version: "0.0.0", main: "index.js" }),
    "utf8"
  );
  await writeFile(
    join(path, "index.js"),
    `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class FixturePlugin extends BasePlugin {}
module.exports = definePlugin(${JSON.stringify(id)}, (context) => new FixturePlugin(context));
`,
    "utf8"
  );
}

afterEach(async () => {
  await plugin?.close();
  plugin = undefined;
});

describe("PsBridgeHost", () => {
  it("registers a menu item and subscribes to menu events on init", async () => {
    const generator = fakeGenerator();
    // port 0 -> ephemeral, so the test never collides with a real server.
    plugin = await PsBridgeHost.init(generator, { port: 0 }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });
    expect(generator.menuItems).toHaveLength(1);
    expect(generator.menuItems[0]?.name).toBe("psGeneratorBridge");
    expect(generator.listeners.has("generatorMenuChanged")).toBe(true);
  });

  it("does not start the selection watcher during host init", async () => {
    const generator = fakeGenerator();
    plugin = await PsBridgeHost.init(generator, { port: 0 }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });

    expect(
      generator.jsxStringCalls.some((call) => call.script.includes("networkEventSubscribe"))
    ).toBe(false);
  });

  it("alerts only when its own menu item is clicked", async () => {
    const generator = fakeGenerator();
    plugin = await PsBridgeHost.init(generator, { port: 0 }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });

    generator.emit("generatorMenuChanged", { generatorMenuChanged: { name: "someoneElse" } });
    expect(generator.alerts).toHaveLength(0);

    generator.emit("generatorMenuChanged", { generatorMenuChanged: { name: "psGeneratorBridge" } });
    expect(generator.alerts).toHaveLength(1);
    expect(generator.alerts[0]).toMatch(/listening on/);
  });

  it("satisfies the PluginHost surface (jsx + module getters reachable after init)", async () => {
    const generator = fakeGenerator();
    plugin = await PsBridgeHost.init(generator, { port: 0 }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });

    // Type-level: PsBridgeHost is assignable to PluginHost (RFC 0003).
    const _satisfies: PluginHost = plugin;
    void _satisfies;

    // Runtime: the PluginHost surface is reachable; modules exist from construction.
    expect(plugin.jsx).toBeInstanceOf(JsxRunner);
    expect(plugin.modules.layer).toBeInstanceOf(LayerModule);
    expect(plugin.modules.document).toBeInstanceOf(DocumentModule);
    expect(plugin.modules.action).toBeInstanceOf(ActionModule);
    expect(plugin.modules.selection).toBeInstanceOf(SelectionModule);

    const initialized = plugin!;
    if (false) {
      initialized.emitModuleEvent(MainEvent.SelectionChanged, null);
      // @ts-expect-error lifecycle main events are emitted by the host, not feature modules.
      initialized.emitModuleEvent(MainEvent.Ready, { port: 1, plugins: [] });
    }
  });

  it("loads and registers plugins from the configured pluginsDir", async () => {
    // A plugin folder (package.json + main) under a fixture dir; the host should
    // discover, construct, and register it. Observed via the "plugin loaded" log
    // so the test needs no access to the host's private server/port.
    const dir = await realpath(await mkdtemp(join(tmpdir(), "host-plugins-")));
    const base = join(dir, "good");
    await mkdir(base, { recursive: true });
    await writeFile(
      join(base, "package.json"),
      JSON.stringify({ name: "@fixture/good", version: "0.0.0", main: "index.js" }),
      "utf8"
    );
    await writeFile(
      join(base, "index.js"),
      `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class GoodPlugin extends BasePlugin {}
module.exports = definePlugin("good", (context) => new GoodPlugin(context));
`,
      "utf8"
    );

    const infos: string[] = [];
    const logger: Logger = {
      debug() {},
      info: (msg: string) => infos.push(msg),
      warn() {},
      error() {},
    };
    plugin = await PsBridgeHost.init(fakeGenerator(), { port: 0, pluginsDir: dir }, logger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });

    expect(infos.some((m) => m.includes("plugin loaded: good (good)"))).toBe(true);
  });

  it("prepends env and config plugin paths before the collection", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "host-plugin-sources-")));
    const envPlugin = join(root, "env-plugin");
    const configPlugin = join(root, "config-plugin");
    const collection = join(root, "collection");
    await writePluginPackage(envPlugin, "env");
    await writePluginPackage(configPlugin, "config");
    await writePluginPackage(join(collection, "base-plugin"), "base");
    const previous = process.env.PS_BRIDGE_PLUGINS;
    process.env.PS_BRIDGE_PLUGINS = `${delimiter}${envPlugin}${delimiter}`;

    try {
      plugin = await PsBridgeHost.init(
        fakeGenerator(),
        { port: 0, plugins: [configPlugin], pluginsDir: collection },
        silentLogger,
        { polyfillsDir: SOURCE_POLYFILLS }
      );
      const port = (plugin as unknown as { server: { port: number } }).server.port;

      const response = await fetch(`http://127.0.0.1:${port}/plugins`);
      await expect(response.json()).resolves.toEqual({
        plugins: [{ id: "env" }, { id: "config" }, { id: "base" }],
      });
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, "PS_BRIDGE_PLUGINS");
      else process.env.PS_BRIDGE_PLUGINS = previous;
    }
  });

  it("preserves the winning plugin's event subscriptions when a duplicate id is skipped", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "host-plugin-duplicate-")));
    const winner = join(root, "winner");
    const collection = join(root, "collection");
    const counterKey = "ps-bridge-test-duplicate-winner";
    await mkdir(winner, { recursive: true });
    await writeFile(
      join(winner, "package.json"),
      JSON.stringify({ name: "@fixture/winner", version: "0.0.0", main: "index.js" }),
      "utf8"
    );
    await writeFile(
      join(winner, "index.js"),
      `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class WinnerPlugin extends BasePlugin {
  constructor(context) {
    super(context);
    this.events.on("selection:changed", () => {
      const key = Symbol.for(${JSON.stringify(counterKey)});
      globalThis[key] = (globalThis[key] || 0) + 1;
    });
  }
}
module.exports = definePlugin("shared", (context) => new WinnerPlugin(context));
`,
      "utf8"
    );
    await writePluginPackage(join(collection, "duplicate"), "shared");
    const key = Symbol.for(counterKey);
    const counters = globalThis as unknown as Record<symbol, number>;
    counters[key] = 0;

    try {
      plugin = await PsBridgeHost.init(
        fakeGenerator(),
        { port: 0, plugins: [winner], pluginsDir: collection },
        silentLogger,
        { polyfillsDir: SOURCE_POLYFILLS }
      );

      plugin.emitModuleEvent(MainEvent.SelectionChanged, null);
      expect(counters[key]).toBe(1);
    } finally {
      Reflect.deleteProperty(counters, key);
    }
  });

  it("continues host startup when one loaded plugin fails registration", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "host-plugins-")));
    const brokenDir = join(dir, "a-broken");
    const goodDir = join(dir, "z-good");
    await mkdir(brokenDir, { recursive: true });
    await mkdir(goodDir, { recursive: true });
    await writeFile(
      join(brokenDir, "package.json"),
      JSON.stringify({ name: "@fixture/broken", version: "0.0.0", main: "index.js" }),
      "utf8"
    );
    await writeFile(
      join(brokenDir, "index.js"),
      `const { BasePlugin, definePlugin, api } = require(${JSON.stringify(SDK_PLUGIN)});
const META = Symbol.for("Symbol.metadata");
class BrokenPlugin extends BasePlugin {
  first() { return { handler: "first" }; }
  duplicate() { return { handler: "duplicate" }; }
}
const meta = {};
BrokenPlugin[META] = meta;
api("/partial")(BrokenPlugin.prototype.first, { name: "first", metadata: meta });
api("/partial")(BrokenPlugin.prototype.duplicate, { name: "duplicate", metadata: meta });
module.exports = definePlugin("broken", (context) => new BrokenPlugin(context));
`,
      "utf8"
    );
    await writeFile(
      join(goodDir, "package.json"),
      JSON.stringify({ name: "@fixture/good", version: "0.0.0", main: "index.js" }),
      "utf8"
    );
    await writeFile(
      join(goodDir, "index.js"),
      `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class GoodPlugin extends BasePlugin {}
module.exports = definePlugin("good", (context) => new GoodPlugin(context));
`,
      "utf8"
    );

    plugin = await PsBridgeHost.init(fakeGenerator(), { port: 0, pluginsDir: dir }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });
    const port = (plugin as unknown as { server: { port: number } }).server.port;

    const plugins = await fetch(`http://127.0.0.1:${port}/plugins`);
    await expect(plugins.json()).resolves.toEqual({ plugins: [{ id: "good" }] });

    const health = await fetch(`http://127.0.0.1:${port}/plugins/broken/health`);
    await expect(health.json()).resolves.toMatchObject({
      id: "broken",
      status: "failed",
      lastError: { code: ErrorCode.PluginRegistrationFailed },
      checks: { load: "ok", registration: "failed" },
    });

    const partial = await fetch(`http://127.0.0.1:${port}/broken/partial`);
    expect(partial.status).toBe(404);
  });

  it("records skipped plugin diagnostics for HTTP health checks", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "host-plugins-")));
    await mkdir(join(dir, "bad"), { recursive: true });

    plugin = await PsBridgeHost.init(fakeGenerator(), { port: 0, pluginsDir: dir }, silentLogger, {
      polyfillsDir: SOURCE_POLYFILLS,
    });
    const port = (plugin as unknown as { server: { port: number } }).server.port;

    const response = await fetch(`http://127.0.0.1:${port}/plugins/bad/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "bad",
      status: "failed",
      clients: 0,
      lastError: {
        code: ErrorCode.PluginLoadFailed,
        details: { pluginId: "bad" },
      },
      checks: { load: "failed" },
    });
  });
});

describe("BaseModule", () => {
  it("exposes its name and the owning plugin", () => {
    class Demo extends BaseModule {}
    const owner = { id: "plugin" } as unknown as PsBridgeHost;
    const module = new Demo("demo", owner);
    expect(module.name).toBe("demo");
    expect(module.plugin).toBe(owner);
  });
});
