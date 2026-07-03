/**
 * Standalone dev entry (ADR 0003): starts the WebSocket service with the test
 * suite's fake PS generator so the SDK can be exercised without Photoshop. Run
 * via `pnpm dev` or the "Run Standalone Dev Server (Fake PS)" launch config.
 *
 * Lives under `test/` (not `src/`) because it is a manual harness, not shipped
 * plugin code, and it reuses the same `fakeGenerator()` the suite is built on.
 */
import { startServer, DEFAULT_PORT } from "../src/server";
import { EventManager } from "../src/utils/eventManager";
import { JsxRunner } from "../src/utils/jsxRunner";
import { useLogger } from "@ps-generator-bridge/sdk/plugin";
import { fakeGenerator } from "./fakeGenerator";

const logger = useLogger("dev-server");

const port = Number(process.env.PS_BRIDGE_PORT ?? DEFAULT_PORT);
const generator = fakeGenerator();
const jsx = new JsxRunner(generator, logger);
const events = new EventManager(generator);

void startServer({ port, generator, jsx, events, logger }).then((server) => {
  logger.info(
    `dev server ready on http://127.0.0.1:${server.port} (/health, /plugins; no plugins loaded)`
  );
});
