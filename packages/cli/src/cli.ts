#!/usr/bin/env node
import { parseArgs, USAGE } from "./cliArgs";
import { runClean, runDev, runHarness, setupGeneratorCore } from "./core";
import { withOperationLock } from "./operationLock";
import { setupGeneratorRuntime } from "./setup";
import { setupGeneratorSettings } from "./setupGeneratorSettings";
import { setupPhotoshop } from "./setupPhotoshop";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    console.log(USAGE);
    return;
  }
  if (parsed.command === "setup-generator-settings") {
    const result = setupGeneratorSettings({
      pref: parsed.options.pref as string,
      password: parsed.options.password,
    });
    if (result.changedKeys.length === 0) {
      console.log(`Photoshop Generator settings already configured: ${result.path}`);
    } else {
      console.log(`Configured Photoshop Generator settings: ${result.path}`);
      console.log(`Updated preference keys: ${result.changedKeys.join(", ")}`);
    }
    return;
  }

  await withOperationLock(
    async () => {
      if (parsed.command === "clean") {
        await runClean();
        return;
      }
      if (parsed.command === "setup") {
        const result = setupGeneratorRuntime(parsed.options);
        console.log(`Installed generator runtime ${result.version}: ${result.targetDir}`);
        return;
      }
      if (parsed.command === "setup-photoshop") {
        await setupPhotoshop(parsed.options);
        return;
      }
      if (parsed.command === "setup-core") {
        await setupGeneratorCore({ update: parsed.options.updateCore ?? parsed.options.update });
        return;
      }
      if (parsed.command === "run") {
        await runHarness(parsed.options);
        return;
      }
      await runDev(parsed.options);
    },
    { command: parsed.command }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
