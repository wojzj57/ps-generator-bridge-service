import { resolve } from "node:path";
import { defineConfig } from "tsup";

// Single CJS bundle that generator-core can `require` (the CJS boundary lives in
// main.js). The @ps-generator-bridge/sdk protocol contract is inlined *from
// source* (alias below) so the server build never depends on a prebuilt sdk and
// always sees the current contract. The server runtime deps (`fastify`,
// `@fastify/websocket`, `ws`) stay external and resolve from node_modules at
// runtime inside PS's Node, rather than being inlined into the bundle.
//
// tsup runs with cwd = this package dir, so the sibling sdk source resolves
// relative to it.
const sdkSource = resolve(process.cwd(), "../sdk/src/index.ts");
const sdkPluginSource = resolve(process.cwd(), "../sdk/src/plugin/index.ts");

export default defineConfig({
  entry: { index: "src/index.ts", contract: "src/contract.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node18",
  outDir: "dist",
  dts: true,
  sourcemap: true, // TS breakpoints under VSCode (outFiles -> dist)
  clean: true,
  splitting: false,
  shims: false,
  external: ["ws", "fastify", "@fastify/websocket", "sharp", "cos-nodejs-sdk-v5"],
  esbuildOptions(options) {
    // esbuild alias is prefix-based; list the longer `/plugin` subpath before
    // the root so it is matched first (tsconfig paths does longest-match on its
    // own, but esbuild is order-sensitive).
    options.alias = {
      ...options.alias,
      "@ps-generator-bridge/sdk/plugin": sdkPluginSource,
      "@ps-generator-bridge/sdk": sdkSource,
    };
  },
  // jsx ships as plain-text resources (ADR 0008) and is NOT copied into the
  // build: `JsxRunner` resolves them from the package's `jsx/` tree directly
  // (`__dirname/../jsx`, where __dirname is `dist`), so the source files are the
  // single runtime location. Same for plugins, which the loader reads from
  // `<package>/plugins` at runtime.
});
