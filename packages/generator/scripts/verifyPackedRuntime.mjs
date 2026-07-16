import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

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
assert.equal(existsSync(join(runtimeDir, "node_modules")), false, "runtime root has node_modules");
for (const name of ["main.js", "dist", "jsx", "vendor"]) {
  assert.equal(existsSync(join(runtimeDir, name)), true, `packed runtime is missing ${name}`);
}

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

const vendorRequire = createRequire(join(runtimeDir, "vendor", "package.json"));
const sharp = vendorRequire("sharp");
assert.equal(sharp.versions.sharp, "0.32.6", "packed sharp version is not pinned");

const png = await sharp(Buffer.from([255, 0, 0, 255]), {
  raw: { width: 1, height: 1, channels: 4 },
})
  .png()
  .toBuffer();
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

console.log(
  `[generator-pack] verified ${runtimeDir} with Node ${process.versions.node} on ${process.platform}-${process.arch}`
);
