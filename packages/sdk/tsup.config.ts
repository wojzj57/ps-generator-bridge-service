import { defineConfig } from "tsup";

// Dual ESM + CJS + .d.ts so the SDK is consumable from browsers and Node >=18.
// platform "neutral" keeps us honest: no Node builtins are assumed (browser
// safety is also guarded at the type level — see tsconfig `types: []`).
export default defineConfig({
  entry: { index: "src/index.ts", plugin: "src/plugin/index.ts" },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2021",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
