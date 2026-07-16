import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { loadPlugins, parsePluginPaths, type LoadResult } from "../src/plugins";
import { createServer, type PsBridgeServer } from "../src/server";
import type { PluginHost } from "@ps-generator-bridge/sdk/plugin";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import { fakeGenerator } from "./fakeGenerator";

// Plugin packages are CJS; they depend on the published SDK plugin subpath.
// Fixtures require the built SDK dist by absolute path, exercising a separately
// bundled authoring runtime and the stable cross-bundle decorator metadata.
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
  events: { on: () => {}, once: () => {}, off: () => {}, dispose: () => {} },
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
  `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class P extends BasePlugin { ${body} }
module.exports = definePlugin(${JSON.stringify(id)}, (context) => new P(context));
`;

// A valid plugin with a manually-applied @ws (plain .js cannot use decorator
// syntax under Node 18; this mirrors what tsc emits for `@ws("good:ping")`).
const GOOD_SRC = `
const { BasePlugin, definePlugin, ws } = require(${JSON.stringify(SDK_PLUGIN)});
const META = Symbol.for("Symbol.metadata");
class GoodPlugin extends BasePlugin {
  ping(p) { return { pong: (p && p.n) || 0 }; }
}
const meta = {};
GoodPlugin[META] = meta;
ws("good:ping")(GoodPlugin.prototype.ping, { name: "ping", metadata: meta });
module.exports = definePlugin("good", (context) => new GoodPlugin(context));
`;

async function writeStandalonePlugin(path: string, id: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({ name: `@fixture/${id}`, version: "0.0.0", main: "index.js" }),
    "utf8"
  );
  await writeFile(join(path, "index.js"), klass(id), "utf8");
}

describe("loadPlugins", () => {
  it("parses platform-delimited plugin paths, trimming and ignoring empty entries", () => {
    const first = join(tmpdir(), "plugin one");
    const second = join(tmpdir(), "plugin-two");

    expect(parsePluginPaths(` ${first} ${delimiter}${delimiter} ${second} `)).toEqual([
      first,
      second,
    ]);
  });

  it("loads explicit package paths before config paths and the collection", async () => {
    const root = await newDir();
    const envPlugin = join(root, "env-plugin");
    const configPlugin = join(root, "config-plugin");
    const collection = join(root, "collection");
    await writeStandalonePlugin(envPlugin, "env");
    await writeStandalonePlugin(configPlugin, "config");
    await writeStandalonePlugin(join(collection, "base-plugin"), "base");

    const res = await loadPlugins({
      pluginDirs: [envPlugin, configPlugin],
      pluginsDir: collection,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded.map((plugin) => plugin.id)).toEqual(["env", "config", "base"]);
  });

  it("rejects relative explicit paths without stopping later plugins", async () => {
    const root = await newDir();
    const validPlugin = join(root, "valid-plugin");
    await writeStandalonePlugin(validPlugin, "valid");

    const res = await loadPlugins({
      pluginDirs: ["relative-plugin", validPlugin],
      pluginsDir: join(root, "missing-collection"),
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded.map((plugin) => plugin.id)).toEqual(["valid"]);
    expect(res.skipped[0]).toMatchObject({
      path: "relative-plugin",
      reason: "plugin path must be absolute",
    });
  });

  it("skips unavailable explicit paths and paths that are not directories", async () => {
    const root = await newDir();
    const missing = join(root, "missing-plugin");
    const file = join(root, "plugin.js");
    await writeFile(file, "module.exports = {};", "utf8");

    const res = await loadPlugins({
      pluginDirs: [missing, file],
      pluginsDir: join(root, "missing-collection"),
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded).toEqual([]);
    expect(res.skipped.map((item) => item.reason)).toEqual([
      expect.stringContaining("plugin path is unavailable"),
      "plugin path is not a directory",
    ]);
  });

  it("deduplicates explicit and collection candidates by real path", async () => {
    const root = await newDir();
    const plugin = join(root, "plugin");
    const collection = join(root, "collection");
    await writeStandalonePlugin(plugin, "once");
    await mkdir(collection, { recursive: true });
    const collectionLink = join(collection, "linked-plugin");
    await symlink(plugin, collectionLink, process.platform === "win32" ? "junction" : "dir");

    const res = await loadPlugins({
      pluginDirs: [plugin, join(plugin, ".")],
      pluginsDir: collection,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded.map((item) => item.id)).toEqual(["once"]);
    expect(res.skipped).toEqual([]);
  });

  it("keeps the first plugin id claimant when a collection plugin duplicates it", async () => {
    const root = await newDir();
    const explicitPlugin = join(root, "explicit");
    const collection = join(root, "collection");
    await writeStandalonePlugin(explicitPlugin, "shared");
    await writeStandalonePlugin(join(collection, "fallback"), "shared");

    const res = await loadPlugins({
      pluginDirs: [explicitPlugin],
      pluginsDir: collection,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded).toHaveLength(1);
    expect(res.loaded[0]?.path).toBe(join(explicitPlugin, "index.js"));
    expect(res.skipped[0]?.reason).toContain(`already claimed by '${explicitPlugin}'`);
  });

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

  it("accepts a bare module.exports = initializer (CJS interop)", async () => {
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

  it("accepts module.exports.default = initializer (esModule interop)", async () => {
    const d = await newDir();
    await writePlugin("esm", {
      "index.js": `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class EsmPlugin extends BasePlugin {}
module.exports.default = definePlugin("esm", (context) => new EsmPlugin(context));
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

  it("skips a non-function default export", async () => {
    const d = await newDir();
    await writePlugin("notclass", { "index.js": `module.exports = { foo: 1 };\n` });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]?.reason).toMatch(/not a plugin initializer function/);
  });

  it("rejects class default exports without checking BasePlugin identity", async () => {
    const d = await newDir();
    await writePlugin(
      "plain",
      {
        "index.js": `class Plain {}\nmodule.exports = Plain;\n`,
      },
      { pluginId: "plain" }
    );
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped[0]).toMatchObject({ phase: "import" });
    expect(res.skipped[0]?.reason).toMatch(/initializer function, not a class/);
  });

  it("skips a scoped package with no explicit plugin id", async () => {
    const d = await newDir();
    await writePlugin("noid", {
      "index.js": `const { BasePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
class NoId extends BasePlugin {}
module.exports = (context) => new NoId(context);
`,
    });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.skipped[0]?.reason).toMatch(/illegal id '@fixture\/noid'/);
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
    expect(res.skipped[0]?.reason).toMatch(
      /duplicate id 'taken' \(already claimed by '<reserved>'\)/
    );
  });

  it("skips a later plugin whose id collides with an earlier folder, naming the winner", async () => {
    const d = await newDir();
    // Folders load in sorted order: "a-first" wins the id, "z-second" is skipped.
    await writePlugin("a-first", { "index.js": klass("shared") });
    await writePlugin("z-second", { "index.js": klass("shared") });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded.map((l) => l.id)).toEqual(["shared"]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]?.path).toBe("z-second");
    expect(res.skipped[0]?.reason).toMatch(
      /duplicate id 'shared' \(already claimed by 'a-first'\)/
    );
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
    // The plugin reads its initializer id from a dependency it ships in its own
    // node_modules. If walk-up did not work, the require would throw and the
    // plugin would be skipped — so a successful load with id "walkup" proves the
    // dependency resolved from the plugin's own node_modules.
    const d = await newDir();
    await writePlugin("walkup", {
      "index.js": `const { BasePlugin, definePlugin } = require(${JSON.stringify(SDK_PLUGIN)});
const dep = require("fake-dep");
class WalkUp extends BasePlugin {}
module.exports = definePlugin(dep.id, (context) => new WalkUp(context));
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

  it("resolves identity from manifest, initializer metadata, then an unscoped package name", async () => {
    const d = await newDir();
    await writePlugin(
      "manifest",
      { "index.js": `module.exports = () => ({});\n` },
      { name: "@fixture/manifest", pluginId: "from-manifest" }
    );
    await writePlugin("code", { "index.js": klass("from-code") });
    await writePlugin(
      "name",
      { "index.js": `module.exports = () => ({});\n` },
      { name: "from-name" }
    );

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded.map((plugin) => plugin.id)).toEqual([
      "from-code",
      "from-manifest",
      "from-name",
    ]);
  });

  it("rejects conflicting manifest/initializer ids and a mismatched runtime id", async () => {
    const d = await newDir();
    await writePlugin("a-conflict", { "index.js": klass("from-code") }, { pluginId: "manifest" });
    await writePlugin(
      "b-runtime",
      { "index.js": `module.exports = () => ({ pluginId: "other" });\n` },
      { pluginId: "runtime" }
    );

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded).toEqual([]);
    expect(res.skipped[0]).toMatchObject({ phase: "identity" });
    expect(res.skipped[0]?.reason).toMatch(/pluginId mismatch/);
    expect(res.skipped[1]).toMatchObject({ phase: "runtime-validation", id: "runtime" });
    expect(res.skipped[1]?.reason).toMatch(/does not match resolved pluginId/);
  });

  it("rejects async initializers and invalid lifecycle hook shapes", async () => {
    const d = await newDir();
    await writePlugin(
      "a-async",
      { "index.js": `module.exports = async () => ({});\n` },
      { pluginId: "async" }
    );
    await writePlugin(
      "b-hook",
      { "index.js": `module.exports = () => ({ onConnect: true });\n` },
      { pluginId: "hook" }
    );

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.skipped[0]).toMatchObject({ phase: "init", id: "async" });
    expect(res.skipped[0]?.reason).toMatch(/must be synchronous/);
    expect(res.skipped[1]).toMatchObject({ phase: "runtime-validation", id: "hook" });
    expect(res.skipped[1]?.reason).toMatch(/onConnect must be a function/);
  });

  it("keeps loading when failed-plugin event cleanup also throws", async () => {
    const d = await newDir();
    await writePlugin(
      "a-failed",
      { "index.js": `module.exports = async () => ({});\n` },
      { pluginId: "shared" }
    );
    await writePlugin("b-fallback", { "index.js": klass("shared") });
    const cleanupFailingHost = {
      ...fakeHost,
      events: {
        ...fakeHost.events,
        dispose() {
          throw new Error("cleanup failed");
        },
      },
    } as PluginHost;

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => cleanupFailingHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });

    expect(res.loaded.map((plugin) => plugin.id)).toEqual(["shared"]);
    expect(res.skipped[0]).toMatchObject({ path: "a-failed", phase: "init", id: "shared" });
  });

  it("lets the first fully activated duplicate claim the id", async () => {
    const d = await newDir();
    await writePlugin("a-first", { "index.js": klass("shared") });
    await writePlugin("b-second", { "index.js": klass("shared") });
    let attempts = 0;

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      activate: async () =>
        ++attempts === 1 ? { ok: false, reason: "first registration failed" } : { ok: true },
      logger: recordingLogger(),
    });

    expect(attempts).toBe(2);
    expect(res.loaded).toHaveLength(1);
    expect(res.loaded[0]?.path).toBe(join(d, "b-second", "index.js"));
    expect(res.skipped[0]).toMatchObject({
      path: "a-first",
      phase: "registration",
      id: "shared",
    });
  });

  it("closes direct registration methods as soon as init returns", async () => {
    const d = await newDir();
    const key = `ps-bridge-context-${process.pid}-${Date.now()}`;
    await writePlugin(
      "closed",
      {
        "index.js": `module.exports = (context) => {
  globalThis[${JSON.stringify(key)}] = context;
  return {};
};
`,
      },
      { pluginId: "closed" }
    );

    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      logger: recordingLogger(),
    });
    expect(res.loaded).toHaveLength(1);
    const captured = Reflect.get(globalThis, key) as
      | { ws(name: string, handler: () => void): void; api(url: string, handler: () => void): void }
      | undefined;
    try {
      expect(captured).toBeDefined();
      expect(() => captured!.ws("late", () => undefined)).toThrow(/context is closed/);
      expect(() => captured!.api("/late", () => undefined)).toThrow(/context is closed/);
    } finally {
      Reflect.deleteProperty(globalThis, key);
    }
  });

  it("registers plain-object WS and API handlers through the init context", async () => {
    const d = await newDir();
    await writePlugin(
      "plain",
      {
        "index.js": `module.exports = (context) => {
  context.ws("plain:ping", (params) => ({ pong: params.n }));
  context.api("/status", () => ({ ok: true }));
  context.api({ method: "POST", url: "/submit" }, () => ({ submitted: true }));
  return { pluginId: context.pluginId };
};
`,
      },
      { pluginId: "plain" }
    );
    server = createServer({ port: 0, generator: fakeGenerator(), logger: recordingLogger() });
    const res = await loadPlugins({
      pluginsDir: d,
      hostFor: () => fakeHost,
      knownIds: new Set(),
      activate: async (candidate) => {
        const result = await server!.pluginManager.register({
          pluginId: candidate.id,
          runtime: candidate.runtime,
          scoped: candidate.scoped,
        });
        return result.ok
          ? { ok: true }
          : { ok: false, reason: result.error.message, cleanupHandled: true };
      },
      logger: recordingLogger(),
    });
    expect(res.loaded.map((plugin) => plugin.id)).toEqual(["plain"]);
    await server.listen();

    const response = await fetch(`http://127.0.0.1:${server.port}/plain/status`);
    expect(await response.json()).toEqual({ ok: true });
    const submitted = await fetch(`http://127.0.0.1:${server.port}/plain/submit`, {
      method: "POST",
    });
    expect(await submitted.json()).toEqual({ submitted: true });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/plain`);
    openSockets.push(ws);
    await new Promise((resolve, reject) => {
      ws.once("error", reject);
      ws.once("message", resolve);
    });
    const frame = await new Promise((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(String(data))));
      ws.send(JSON.stringify({ id: "plain", method: "plain:ping", params: { n: 9 } }));
    });
    expect(frame).toEqual({ id: "plain", ok: true, result: { pong: 9 } });
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
    await server.pluginManager.register({
      pluginId: res.loaded[0]!.id,
      runtime: res.loaded[0]!.runtime,
      scoped: res.loaded[0]!.scoped,
    });
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
