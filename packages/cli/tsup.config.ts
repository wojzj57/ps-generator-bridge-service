import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node18",
  outDir: "dist",
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["@ps-generator-bridge/sdk", "ws"],
});
