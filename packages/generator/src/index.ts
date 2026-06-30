// Bundle entry. main.js requires this file's CJS build, and generator-core calls
// the exported `init(generator, config, logger)`. We ignore generator-core's own
// logger argument and inject our own. This is the composition root.
import { PsBridgeHost, type PluginConfig } from "./plugin";
import { createLogger } from "./utilis/logger";
import type { PsGenerator } from "./types/generator";

export function init(generator: PsGenerator, config?: PluginConfig): void {
  const logger = createLogger();
  // Async init is fire-and-forget; failures are logged, never thrown into core.
  void PsBridgeHost.init(generator, config ?? {}, logger).catch((error) =>
    logger.error("plugin init failed", error)
  );
}

export { PsBridgeHost } from "./plugin";
export type { PluginConfig } from "./plugin";
export type { PsGenerator } from "./types/generator";
export { JsxRunner } from "./utilis/jsxRunner";
