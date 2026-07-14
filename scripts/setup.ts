// One-time repository setup. The CLI owns one shared per-user runtime cache;
// repository development uses the same cache as the published commands.
import {
  assertGeneratorCoreCompatibility,
  ensureGeneratorCore,
  generatorCoreDir,
} from "../packages/cli/src/generatorCore";
import { withOperationLock } from "../packages/cli/src/operationLock";
import { ensureGeneratorRuntime } from "../packages/cli/src/runtimeManager";

await withOperationLock(
  async () => {
    await ensureGeneratorCore({ update: false });
    const runtime = ensureGeneratorRuntime();
    assertGeneratorCoreCompatibility(runtime, generatorCoreDir());
    console.log(`[setup] generator runtime ${runtime.version}: ${runtime.packageDir}`);
    console.log("[setup] done");
  },
  { command: "pnpm setup" }
);
