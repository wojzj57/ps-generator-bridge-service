import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The CLI entry point and Windows/Photoshop integration adapters are
      // covered by argument/parser seams and real-machine smoke testing, not
      // by the cross-platform unit suite.
      exclude: ["src/cli.ts", "src/generatorCore.ts", "src/photoshop.ts", "src/setupPhotoshop.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
