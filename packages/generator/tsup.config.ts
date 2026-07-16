import { resolve } from "node:path";
import { defineConfig } from "tsup";

// CJS bundles that generator-core can `require` (the CJS boundary lives in
// main.js). The @ps-generator-bridge/sdk protocol contract is inlined *from
// source* (alias below) so the server build never depends on a prebuilt sdk and
// always sees the current contract. Pure-JS runtime dependencies are bundled;
// sharp resolves through the package-private vendor tree prepared by prepack.
//
// tsup runs with cwd = this package dir, so the sibling sdk source resolves
// relative to it.
const sdkSource = resolve(process.cwd(), "../sdk/src/index.ts");
const sdkPluginSource = resolve(process.cwd(), "../sdk/src/plugin/index.ts");
const sharpRuntimeSource = resolve(process.cwd(), "src/runtime/sharp.ts");

export default defineConfig({
  entry: {
    index: "src/index.ts",
    contract: "src/contract.ts",
    environment: "src/environment.ts",
  },
  format: ["cjs"],
  platform: "node",
  target: "node18.13",
  outDir: "dist",
  dts: true,
  metafile: true,
  sourcemap: true, // TS breakpoints under VSCode (outFiles -> dist)
  clean: true,
  splitting: false,
  shims: false,
  define: {
    // ws treats these native accelerators as optional. The standalone runtime
    // intentionally uses ws's built-in JS fallbacks so no extra native addons
    // can leak out of the bundle.
    "process.env.WS_NO_BUFFER_UTIL": '"1"',
    "process.env.WS_NO_UTF_8_VALIDATE": '"1"',
  },
  esbuildOptions(options) {
    // esbuild alias is prefix-based; list the longer `/plugin` subpath before
    // the root so it is matched first (tsconfig paths does longest-match on its
    // own, but esbuild is order-sensitive).
    options.alias = {
      ...options.alias,
      "@ps-generator-bridge/sdk/plugin": sdkPluginSource,
      "@ps-generator-bridge/sdk": sdkSource,
      sharp: sharpRuntimeSource,
    };
  },
  // jsx ships as plain-text resources (ADR 0008) at the package root.
  // `JsxRunner` resolves them from `../jsx` when the bundled code runs from
  // `dist`, so installers must keep the top-level `jsx/` directory.
});
