import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, extname, join, resolve } from "node:path";

const runtimeDir = resolve(process.argv[2] ?? ".");
const packageJson = JSON.parse(readFileSync(join(runtimeDir, "package.json"), "utf8"));
const expectedNodeVersion = process.env.PS_BRIDGE_EXPECT_NODE_VERSION;

if (expectedNodeVersion) {
  assert.equal(process.versions.node, expectedNodeVersion, "unexpected Node validation version");
}
assert.equal(process.platform, "win32", "packed runtime validation requires Windows");
assert.equal(process.arch, "x64", "packed runtime validation requires x64");
assert.deepEqual(packageJson.os, ["win32"], "packed runtime must target Windows");
assert.deepEqual(packageJson.cpu, ["x64"], "packed runtime must target x64");

assert.deepEqual(
  packageJson.dependencies ?? {},
  {},
  "packed runtime must not declare dependencies"
);
for (const path of walk(runtimeDir)) {
  assert.notEqual(basename(path), "node_modules", `packed runtime contains node_modules: ${path}`);
}
assert.equal(existsSync(join(runtimeDir, "vendor")), false, "packed runtime still has vendor");
for (const name of ["main.js", "dist", "jsx", "native"]) {
  assert.equal(existsSync(join(runtimeDir, name)), true, `packed runtime is missing ${name}`);
}

const nativeDir = join(runtimeDir, "native");
const nativeEntries = readdirSync(nativeDir, { withFileTypes: true });
assert.equal(
  nativeEntries.every((entry) => entry.isFile()),
  true,
  "packed native runtime must be a flat directory"
);
for (const name of ["sharp-win32-x64.node", "libvips-42.dll", "versions.json"]) {
  assert.equal(existsSync(join(nativeDir, name)), true, `packed native runtime is missing ${name}`);
}
assert.equal(
  nativeEntries.some((entry) => extname(entry.name) === ".dll"),
  true,
  "packed native runtime has no DLLs"
);

const runtimeRequire = createRequire(join(runtimeDir, "package.json"));
const entry = runtimeRequire("./main.js");
assert.equal(typeof entry.init, "function", "generator entry does not export init");
assert.equal(typeof entry.PsBridgeHost?.init, "function", "generator host is not exported");

const listeners = new Map();
const generator = {
  addMenuItem() {},
  alert() {},
  onPhotoshopEvent(event, listener) {
    const eventListeners = listeners.get(event) ?? [];
    eventListeners.push(listener);
    listeners.set(event, eventListeners);
  },
  removePhotoshopEventListener(event, listener) {
    listeners.set(
      event,
      (listeners.get(event) ?? []).filter((candidate) => candidate !== listener)
    );
  },
  evaluateJSXString() {
    return Promise.resolve(undefined);
  },
};
const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
const host = await entry.PsBridgeHost.init(
  generator,
  { port: 0, pluginsDir: join(runtimeDir, "missing-plugins") },
  logger
);
await host.close();

const loadedNative = Object.keys(runtimeRequire.cache).find(
  (path) => basename(path) === "sharp-win32-x64.node"
);
assert.equal(loadedNative, join(nativeDir, "sharp-win32-x64.node"), "sharp loaded outside native");

const png = await host.modules.image.encodePng({
  width: 1,
  height: 1,
  channelCount: 4,
  rowBytes: 4,
  pixels: Buffer.from([255, 255, 0, 0]),
  bounds: { left: 0, top: 0, right: 1, bottom: 1 },
});
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

console.log(
  `[generator-pack] verified ${runtimeDir} with Node ${process.versions.node} on ${process.platform}-${process.arch}`
);

function walk(root) {
  const paths = [root];
  if (!statSync(root).isDirectory()) return paths;
  for (const entry of readdirSync(root)) paths.push(...walk(join(root, entry)));
  return paths;
}
