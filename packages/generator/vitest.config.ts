import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the sdk workspace imports from source so server tests need no prior
// build of the sdk (mirrors the tsconfig `paths` mapping used for typecheck/tsx).
// Regex `find` anchors exact matches so the root alias does not shadow the
// `/plugin` subpath (rollup alias is prefix-based, first match wins).
const sdkSrc = fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url));
const sdkPluginSrc = fileURLToPath(new URL("../sdk/src/plugin/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ps-generator-bridge\/sdk\/plugin$/, replacement: sdkPluginSrc },
      { find: /^@ps-generator-bridge\/sdk$/, replacement: sdkSrc },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Composition root (manual F5 entry) and the type-only generator
      // contract (no runtime code). The dev server now lives under test/.
      exclude: ["src/index.ts", "src/psGenerator.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
