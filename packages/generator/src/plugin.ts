import type { PsGenerator, GeneratorMenuChangedEvent } from "./types/generator";
import type { Logger } from "./utils/logger";
import { join } from "node:path";
import { createServer, DEFAULT_PORT, type PsBridgeServer } from "./server";
import { bootstrap, type BasePlugin, type PluginHost } from "@ps-generator-bridge/sdk/plugin";
import { loadPlugins } from "./plugins";
import { JsxRunner } from "./utils/jsxRunner";
import { EventManager } from "./utils/eventManager";
import { MODULES, ActionModule, DocumentModule, LayerModule, ImageModule } from "./modules";
import { CosService } from "./services/cos";
import { PLUGIN_NAME, PLUGIN_VERSION } from "./meta";

// The menu id is echoed back on "generatorMenuChanged", so it must be a stable,
// alphanumeric token unique to this plugin.
const MENU_ID = "psGeneratorBridge";
const MENU_LABEL = "PS Generator Bridge: Server";
const MENU_EVENT = "generatorMenuChanged";

// Re-exported for callers that imported it from here before the server module
// owned the default (now defined in ./server).
export { DEFAULT_PORT };

/** Host config handed in by generator-core (self._config[name]). */
export interface PluginConfig {
  port?: number;
  /**
   * Directory whose direct child folders are loaded as plugin packages
   * (each a `package.json` with a `main` entry; see the plugin loader).
   * Defaults to `<generator-package>/plugins` — i.e. `packages/generator/plugins`,
   * a symlink to the repo-root `/plugins` in development.
   */
  pluginsDir?: string;
  [key: string]: unknown;
}

/**
 * Test-only overrides for `JsxRunner` construction. Production callers pass
 * nothing; tests point `polyfillsDir` at the source `jsx/polyfills` tree so
 * `init()` reads real files instead of the bundler's `dist/jsx/polyfills`
 * (which `__dirname`-based resolution can't reach under vitest's source
 * runtime).
 */
export interface JsxRunnerOverrides {
  polyfillsDir?: string;
}

/**
 * The host generator-core loads. Registers a menu item and starts the server's
 * own WebSocket service (ADR 0003). Every call into Photoshop goes through the
 * injected `generator`, which makes the whole init path observable from a test
 * mock (see test/fakeGenerator.ts).
 */
export class PsBridgeHost implements PluginHost {
  private server: PsBridgeServer | undefined;
  /** Feature modules, reached by short key (`host.modules.layer`, ADR 0009). */
  public readonly modules: {
    layer: LayerModule;
    document: DocumentModule;
    action: ActionModule;
    image: ImageModule;
  };
  private plugins: BasePlugin[] = [];
  private readonly _jsx: JsxRunner;
  private readonly _events: EventManager;
  /**
   * Optional object-storage upload service (RFC 0008). Set from the environment
   * at construction — present only when the `PS_BRIDGE_COS_*` fields are configured;
   * otherwise undefined. Reached by modules and plugins through `plugin.cos`.
   */
  public readonly cos?: CosService;

  private constructor(
    public readonly generator: PsGenerator,
    public readonly config: PluginConfig,
    public readonly logger: Logger,
    overrides?: JsxRunnerOverrides
  ) {
    this.modules = {
      layer: new MODULES.layer(this),
      document: new MODULES.document(this),
      action: new MODULES.action(this),
      image: new MODULES.image(this),
    };
    this._jsx = new JsxRunner(generator, logger, overrides?.polyfillsDir);
    this._events = new EventManager(generator);
    this.cos = CosService.fromEnv(logger);
    logger.info(this.cos ? "CosService enabled" : "CosService disabled (env incomplete)");
  }

  /** Run packaged jsx by name (ADR 0008). Used by modules and other server callers. */
  get jsx(): JsxRunner {
    return this._jsx;
  }

  /** Photoshop event subscriptions owned by the host. */
  get events(): EventManager {
    return this._events;
  }

  /**
   * Build the host contract for one plugin (RFC 0005). A shallow view that shares
   * the host's `modules` and `events` (both global-singleton semantics — they do
   * not split per plugin) but swaps in a `jsx` scoped to `<pluginDir>/jsx`, so the
   * plugin's `jsx.execute("x")` resolves to its own files while `executeBuiltin`
   * still reaches the built-in tree. Passed to `loadPlugins` as the `hostFor`
   * factory; the plugin never sees the concrete `PsBridgeHost`.
   */
  private hostFor(pluginDir: string): PluginHost {
    return {
      modules: this.modules,
      events: this._events,
      jsx: this._jsx.forPlugin(join(pluginDir, "jsx")),
      cos: this.cos,
    };
  }

  /** Entry point: construct the host and run its async initialization. */
  static async init(
    generator: PsGenerator,
    config: PluginConfig,
    logger: Logger,
    overrides?: JsxRunnerOverrides
  ): Promise<PsBridgeHost> {
    const host = new PsBridgeHost(generator, config, logger, overrides);
    await host.onInit();
    return host;
  }

  private async onInit(): Promise<void> {
    this.logger.info(`${PLUGIN_NAME} v${PLUGIN_VERSION} initializing`);
    this.createMenuItem();
    const port = this.config.port ?? portFromEnv(this.logger) ?? DEFAULT_PORT;
    // Build first, then let modules/plugins register their routes/methods, then
    // listen — fastify requires all HTTP routes before listen (ADR 0006).
    const server = createServer({
      port,
      generator: this.generator,
      jsx: this._jsx,
      events: this._events,
      logger: this.logger,
    });
    this.server = server;
    // Plugins are loaded entirely from `pluginsDir`: scan its direct child
    // folders for `package.json` packages, validate + construct each with its
    // `static id` and this host. A missing dir is the default state (no plugins
    // installed). Modules exist from construction so a plugin can read
    // `this.plugin.modules.<key>` (ADR 0009).
    // Resolution order: explicit `config.pluginsDir`, then the
    // PS_BRIDGE_PLUGINS_DIR env override, else the package-local
    // `plugins/` tree (__dirname is `dist`, so `../plugins`).
    const pluginsDir =
      this.config.pluginsDir ??
      process.env.PS_BRIDGE_PLUGINS_DIR ??
      join(__dirname, "..", "plugins");
    const { loaded, skipped } = await loadPlugins({
      pluginsDir,
      hostFor: (pluginDir) => this.hostFor(pluginDir),
      knownIds: new Set(),
      logger: this.logger,
    });
    for (const s of skipped) this.logger.warn(`plugin skipped: ${s.path} — ${s.reason}`);
    this.plugins = loaded.map((l) => l.plugin);
    // Register every plugin (scoped table + per-plugin ClientStore + bus +
    // /ws/{id} dispatch + prefixed @api) before module bootstrap, so plugin ids
    // are reserved first path segments — a module @api cannot then steal a
    // plugin's namespace (RFC 0004). All routes land before `listen` (fastify).
    for (const plugin of this.plugins) {
      server.pluginManager.register(plugin);
    }
    server.registry.reservedSegments = new Set(server.pluginManager.ids);
    for (const module of Object.values(this.modules)) {
      bootstrap(module, server.registry);
    }
    // Prime the default ExtendScript engine with polyfills before any client
    // request can drive `jsx.execute` / `jsx.run` (ADR 0008). Module/plugin
    // constructors don't touch jsx — only decorated handlers do, and those fire
    // after `listen` — so priming here is early enough.
    await this._jsx.init();
    await server.listen();
    this.logger.info(`${PLUGIN_NAME} initialized`);
  }

  private createMenuItem(): void {
    this.generator.addMenuItem(MENU_ID, MENU_LABEL, true, false);
    this.generator.onPhotoshopEvent(MENU_EVENT, (event: GeneratorMenuChangedEvent) =>
      this.handleMenuClicked(event)
    );
    this.logger.debug(`menu item registered: ${MENU_ID}`);
  }

  // "generatorMenuChanged" fires for *every* plugin's menu, so we must filter to
  // our own id before acting.
  private handleMenuClicked(event: GeneratorMenuChangedEvent): void {
    if (event?.generatorMenuChanged?.name !== MENU_ID) return;
    const port = this.server?.port ?? this.config.port ?? DEFAULT_PORT;
    this.generator.alert(
      `${PLUGIN_NAME} v${PLUGIN_VERSION} — listening on ws://127.0.0.1:${port}/ws`
    );
  }

  /** Stop the WebSocket service (used by tests; PS teardown is process exit). */
  async close(): Promise<void> {
    await this.server?.close();
    this.server = undefined;
  }
}

function portFromEnv(logger: Logger): number | undefined {
  const raw = process.env.PS_BRIDGE_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  logger.warn(`ignoring invalid PS_BRIDGE_PORT: ${raw}`);
  return undefined;
}
