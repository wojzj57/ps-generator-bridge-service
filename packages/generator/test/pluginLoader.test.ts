import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { loadPlugins, type LoadResult } from "../src/plugins";
import { createServer, type PsBridgeServer } from "../src/server";
import type { PluginHost } from "@ps-generator-bridge/sdk/plugin";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import { fakeGenerator } from "./fakeGenerator";

// Plugin packages are CJS; they depend on the published SDK plugin subpath.
// Fixtures require the built SDK dist by absolute path (the loader validates via
// the global Symbol.for brand, so a separately-bundled SDK copy is recognized).
// globalSetup builds the SDK before these tests run.
const SDK_PLUGIN = resolve(__dirname, "../../sdk/dist/plugin.cjs");

interface RecordingLogger extends Logger {
  warns: { msg: string }[];
}

function recordingLogger(): RecordingLogger {
  const warns: { msg: string }[] = [];
  return {
    debug() {},
    info() {},
    error() {},
    warns,
    warn(msg: string) {
      warns.push({ msg });
    },
  } as unknown as RecordingLogger;
}

const fakeHost = {
  jsx: {
    run: () => Promise.resolve(),
    execute: () => Promise.resolve(),
    executeBuiltin: () => Promise.resolve(),
  },
  modules: { layer: {}, document: {}, action: {} },
  // Plugins may subscribe to PS events in their constructor (e.g. SidePaint's
  // `this.events.on("imageChanged", …)`); a listen-only stub keeps construction
  // from throwing in the loader tests.
  events: { on: () => {}, once: () => {}, off: () => {} },
} as unknown as PluginHost;

let dir: string;
let server: PsBridgeServer | undefined;
const openSockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of openSockets.splice(0)) ws.close();
  await server?.close();
  server = undefined;
});

async function newDir(): Promise<string> {
  // realpath resolves the Windows 8.3 short name (e.g. GRIMES~1) so the file://
  // URL the loader builds has no `~` (which url-encodes to %7E and breaks the
  // vite-node module loader under vitest). Production uses native node, unaffected.
  dir = await realpath(await mkdtemp(join(tmpdir(), "pluginloader-")));
  return dir;
}

/**
 * Write a plugin folder under `dir`: a `package.json` (defaulting `main` to
 * `index.js`) plus the given relative files. Pass `pkg` to override fields —
 * e.g. `{ main: "lib/entry.js" }` or `{ main: "" }` to simulate a missing main.
 */
async function writePlugin(
  name: string,
  files: Record<string, string>,
  pkg: Record<string, unknown> = {}
): Promise<void> {
  const base = join(dir, name);
  await mkdir(base, { recursive: true });
  await writeFile(
    join(base, "package.json"),
    JSON.stringify({ name: `@fixture/${name}`, version: "0.0.0", main: "index.js", ...pkg }),
    "utf8"
  );
  for (const [rel, body] of Object.entries(files)) {
    const f = join(base, rel);
    await mkdir(join(f, ".."), { recursive: true });
    await writeFile(f, body, "utf8");
  }
}

async function writeFile2(rel: string, body: string): Promise<void> {
  const f = join(dir, rel);
  await mkdir(join(f, ".."), { recursive: true });
  await writeFile(f, body, "utf8");
}

const klass = (id: string, body = "") =>
  `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class P extends BasePlugin { static id = ${JSON.stringify(id)}; ${body} }
module.exports = P;
`;

// A valid plugin with a manually-applied @ws (plain .js cannot use decorator
// syntax under Node 18; this mirrors what tsc emits for `@ws("good:ping")`).
const GOOD_SRC = `
const { BasePlugin, ws } = require(${JSON.stringify(SDK_PLUGIN)});
const META = Symbol.for("Symbol.metadata");
class GoodPlugin extends BasePlugin {
  static id = "good";
  ping(p) { return { pong: (p && p.n) || 0 }; }
}
const meta = {};
GoodPlugin[META] = meta;
ws("good:ping")(GoodPlugin.prototype.ping, { name: "ping", metadata: meta });
module.exports = GoodPlugin;
`;

describe("loadPlugins", () => {
  it("loads a valid plugin via package.json main and reports no skips", async () => {
    const d = await newDir();
    await writePlugin("good", { "index.js": GOOD_SRC });
    const logger = recordingLogger();
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger,
    });

    expect(res.loaded).toHaveLength(1);
    expect(res.loaded[0]?.id).toBe("good");
    expect(res.skipped).toEqual([]);
    expect(logger.warns).toHaveLength(0);
  });

  it("resolves an entry from a non-default main", async () => {
    const d = await newDir();
    await writePlugin("custom", { "lib/entry.js": klass("custom") }, { main: "lib/entry.js" });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded.map((l) => l.id)).toEqual(["custom"]);
  });

  it("accepts a bare module.exports = Class (CJS interop)", async () => {
    const d = await newDir();
    await writePlugin("bare", { "index.js": klass("bare") });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded.map((l) => l.id)).toEqual(["bare"]);
  });

  it("accepts module.exports.default = Class (esModule interop)", async () => {
    const d = await newDir();
    await writePlugin("esm", {
      "index.js": `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class EsmPlugin extends BasePlugin { static id = "esm"; }
module.exports.default = EsmPlugin;
`,
    });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded.map((l) => l.id)).toEqual(["esm"]);
  });

  it("skips a folder with no package.json", async () => {
    const d = await newDir();
    await writeFile2("nopkg/index.js", klass("nopkg"));
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/package\.json missing or invalid/);
  });

  it('skips a package.json with no "main"', async () => {
    const d = await newDir();
    await writePlugin("nomain", { "index.js": klass("nomain") }, { main: "" });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/has no "main"/);
  });

  it('skips a "main" that escapes the plugin directory', async () => {
    const d = await newDir();
    await writePlugin("escape", {}, { main: "../evil.js" });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/escapes the plugin directory/);
  });

  it("skips a plugin whose entry file is missing", async () => {
    const d = await newDir();
    await writePlugin("gone", {}, { main: "nope.js" });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/load failed/);
  });

  it("skips a non-class default export", async () => {
    const d = await newDir();
    await writePlugin("notclass", { "index.js": `module.exports = { foo: 1 };\n` });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/not a BasePlugin subclass/);
  });

  it("skips a class that does not extend BasePlugin", async () => {
    const d = await newDir();
    await writePlugin("plain", {
      "index.js": `class Plain { static id = "plain"; }\nmodule.exports = Plain;\n`,
    });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped[0]?.reason).toMatch(/not a BasePlugin subclass/);
  });

  it("skips a plugin missing static id", async () => {
    const d = await newDir();
    await writePlugin("noid", {
      "index.js": `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class NoId extends BasePlugin {}
module.exports = NoId;
`,
    });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped[0]?.reason).toMatch(/missing static id/);
  });

  it("skips a plugin with an illegal id", async () => {
    const d = await newDir();
    await writePlugin("badid", { "index.js": klass("bad id!") });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped[0]?.reason).toMatch(/illegal id/);
  });

  it("skips a plugin whose id collides with a known id", async () => {
    const d = await newDir();
    await writePlugin("dup", { "index.js": klass("taken") });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(["taken"]),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/duplicate id 'taken'/);
  });

  it("skips a package that throws on load, isolating the failure", async () => {
    const d = await newDir();
    await writePlugin("boom", { "index.js": `throw new Error("boom");\n` });
    await writePlugin("good", { "index.js": GOOD_SRC });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    // The broken package is skipped; the good one still loads.
    expect(res.loaded.map((l) => l.id)).toEqual(["good"]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]?.reason).toMatch(/load failed/);
  });

  it("ignores a top-level node_modules folder and dotfolders", async () => {
    const d = await newDir();
    await writePlugin("good", { "index.js": GOOD_SRC });
    // A package-looking folder inside node_modules must NOT be scanned.
    await writeFile2("node_modules/dep/package.json", JSON.stringify({ main: "index.js" }));
    await writeFile2("node_modules/dep/index.js", klass("dep"));
    await writeFile2(".hidden/package.json", JSON.stringify({ main: "index.js" }));
    await writeFile2(".hidden/index.js", klass("hidden"));
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded.map((l) => l.id)).toEqual(["good"]);
    expect(res.skipped).toEqual([]);
  });

  it("returns empty (no warn) when pluginsDir is missing", async () => {
    const logger = recordingLogger();
    const res = await loadPlugins({
      pluginsDir: join(tmpdir(), "definitely-not-here-" + process.pid),
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger,
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(logger.warns).toHaveLength(0);
  });

  it("resolves a plugin's own dependency from its node_modules (Node walk-up)", async () => {
    // The plugin reads its static id from a dependency it ships in its own
    // node_modules. If walk-up did not work, the require would throw and the
    // plugin would be skipped — so a successful load with id "walkup" proves the
    // dependency resolved from the plugin's own node_modules.
    const d = await newDir();
    await writePlugin("walkup", {
      "index.js": `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
const dep = require("fake-dep");
class WalkUp extends BasePlugin { static id = dep.id; }
module.exports = WalkUp;
`,
      "node_modules/fake-dep/package.json": JSON.stringify({
        name: "fake-dep",
        version: "1.0.0",
        main: "index.js",
      }),
      "node_modules/fake-dep/index.js": `module.exports = { id: "walkup" };\n`,
    });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped).toEqual([]);
    expect(res.loaded.map((l) => l.id)).toEqual(["walkup"]);
  });

  it("end-to-end: a loaded plugin registers, handshakes, and dispatches on /ws/{id}", async () => {
    const d = await newDir();
    await writePlugin("good", { "index.js": GOOD_SRC });
    const res: LoadResult = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toHaveLength(1);

    server = createServer({ port: 0, generator: fakeGenerator(), logger: recordingLogger() });
    server.pluginManager.register(res.loaded[0]!.plugin);
    await server.listen();

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/good`);
    openSockets.push(ws);
    await new Promise((resolve, reject) => {
      ws.once("error", reject);
      ws.once("message", resolve); // connected handshake
    });

    const response = await new Promise((resolve) => {
      const onMsg = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data));
        if (msg && typeof msg.id === "string") {
          ws.off("message", onMsg);
          resolve(msg);
        }
      };
      ws.on("message", onMsg);
      ws.send(JSON.stringify({ id: "1", method: "good:ping", params: { n: 5 } }));
    });
    expect(response).toEqual({ id: "1", ok: true, result: { pong: 5 } });
  });
});
