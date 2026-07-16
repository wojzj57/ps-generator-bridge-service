import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginHost, Logger } from "@ps-generator-bridge/sdk/plugin";
import {
  cleanupPluginSource,
  preparePluginSource,
  type PluginSource,
} from "../../cli/src/pluginDirs";
import type { PathEnvironment } from "../../cli/src/appPaths";
import { loadPlugins } from "../src/plugins";

const SDK_PLUGIN = resolve(__dirname, "../../sdk/dist/plugin.cjs");

const fakeHost = {
  jsx: {
    run: () => Promise.resolve(),
    execute: () => Promise.resolve(),
    executeBuiltin: () => Promise.resolve(),
  },
  modules: { layer: {}, document: {}, action: {} },
  events: { on: () => {}, once: () => {}, off: () => {} },
} as unknown as PluginHost;

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

let root: string | undefined;
let source: PluginSource | undefined;

afterEach(async () => {
  if (source) await cleanupPluginSource(source);
  source = undefined;
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("CLI managed plugin snapshot", () => {
  it("loads only the linked --plugin package through the generator loader", async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "cli-plugin-snapshot-")));
    const sourceRoot = join(root, "source");
    const pluginDir = join(sourceRoot, "good");
    await writePlugin(pluginDir);

    // This sibling resembles an npm package but is not a Generator plugin. The
    // CLI snapshot must isolate it by linking only `pluginDir`, not `sourceRoot`.
    await mkdir(join(sourceRoot, "ordinary-package"), { recursive: true });
    await writeFile(
      join(sourceRoot, "ordinary-package", "package.json"),
      JSON.stringify({ name: "ordinary-package", version: "1.0.0", main: "index.js" })
    );
    await writeFile(join(sourceRoot, "ordinary-package", "index.js"), "module.exports = {};\n");

    const paths: PathEnvironment = {
      platform: process.platform,
      env: { ...process.env, LOCALAPPDATA: root, XDG_CACHE_HOME: root },
      home: root,
    };
    source = await preparePluginSource({ plugin: pluginDir }, paths);

    const result = await loadPlugins({
      pluginsDir: source.pluginsDir,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger,
    });

    expect(result.loaded.map((plugin) => plugin.id)).toEqual(["good"]);
    expect(result.skipped).toEqual([]);
  });
});

async function writePlugin(pluginDir: string): Promise<void> {
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "package.json"),
    JSON.stringify({ name: "good", version: "1.0.0", main: "index.js" })
  );
  await writeFile(
    join(pluginDir, "index.js"),
    `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class GoodPlugin extends BasePlugin {}
module.exports = definePlugin("good", (context) => new GoodPlugin(context));
`
  );
}
