import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Composition roots and process/filesystem/npm/Photoshop adapters belong
      // to the real-machine smoke boundary, not the cross-platform unit suite.
      exclude: [
        "src/cli.ts",
        "src/core.ts",
        "src/generatorCore.ts",
        "src/photoshop.ts",
        "src/pluginDirs.ts",
        "src/setup.ts",
        "src/setupPhotoshop.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
