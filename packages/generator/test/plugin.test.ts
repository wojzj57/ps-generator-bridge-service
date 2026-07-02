import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { PsBridgeHost } from "../src/plugin";
import { BaseModule } from "../src/modules/base";
import { LayerModule, DocumentModule, ActionModule } from "../src/modules";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { PluginHost } from "@ps-generator-bridge/sdk/plugin";
import type { Logger } from "../src/utils/logger";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const SDK_PLUGIN = resolve(__dirname, "../../sdk/dist/plugin.cjs");

// vitest runs source directly, so JsxRunner's __dirname-based default
// (dist/jsx/polyfills) doesn't exist — point init() at the source tree so
// polyfill priming works in the integration test.
const SOURCE_POLYFILLS = join(__dirname, "..", "jsx", "polyfills");

let plugin: PsBridgeHost | undefined;

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
      `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class GoodPlugin extends BasePlugin { static id = "good"; }
module.exports = GoodPlugin;
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
