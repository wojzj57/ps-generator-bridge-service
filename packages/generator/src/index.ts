// Bundle entry. main.js requires this file's CJS build, and generator-core calls
// the exported `init(generator, config, logger)`. This is the composition root.
import { PsBridgeHost, type PluginConfig } from "./plugin";
import { setGeneratorLogger, useLogger, type Logger } from "@ps-generator-bridge/sdk/plugin";
import type { PsGenerator } from "./types/generator";

export function init(
  generator: PsGenerator,
  config?: PluginConfig,
  generatorLogger?: Logger
): void {
  setGeneratorLogger(generatorLogger);
  const log = useLogger();
  // Async init is fire-and-forget; failures are logged, never thrown into core.
  void PsBridgeHost.init(generator, config ?? {}, log).catch((error) =>
    log.error("plugin init failed", error)
  );
}

export { PsBridgeHost } from "./plugin";
export type { PluginConfig } from "./plugin";
export type { PsGenerator } from "./types/generator";
export { JsxRunner } from "./utils/jsxRunner";
