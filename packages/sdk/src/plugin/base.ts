import type { PluginHost } from "./host";
import type { JsxRunnerApi, PluginEvents } from "@ps-generator-bridge/generator/contract";
import { PsPhotoshopProxy } from "../photoshop";

// A *global* brand so "extends BasePlugin" can be detected across
// separately-bundled SDK copies (an external plugin bundles its own
// @ps-generator-bridge/sdk/plugin, so `instanceof BasePlugin` against the
// server's copy would fail). Stamped on BasePlugin.prototype; any subclass
// inherits it via the prototype chain. See `isBasePluginClass`.
const BASE_PLUGIN_BRAND = Symbol.for("ps-generator-bridge.BasePlugin");

/**
 * Base class for plugins (ADR 0009 / RFC 0003). A plugin is the orchestration
 * layer above feature modules: it composes one or more module calls (reached
 * through `this.modules`, e.g. `this.modules.layer`) and exposes
 * its own `@ws`/`@api` handlers, bootstrapped the same way as modules.
 *
 * Dependency direction is strictly downward: a plugin may depend on modules,
 * never on sibling plugins and never in reverse (modules must not reach
 * plugins). `plugin` is the abstract PluginHost interface — never the
 * concrete server plugin — so a plugin depends only on this SDK subpath.
 *
 * `@ws`/`@api` names are written in full by the developer (e.g.
 * `@ws("LayerOps:merge")`) — `bootstrap` does not inject or derive a namespace.
 * Use a `Domain:action` prefix to keep names from colliding across modules and
 * plugins (ADR 0006 convention); the assembler's `registerMethod` is a silent
 * `Map.set`, so prefix uniqueness is the developer's responsibility.
 *
 * Client push goes through `this.events.emit(...)`; remote clients receive only
 * events they subscribed to through the protocol. A subclass may override
 * `onConnect`/`onDisconnect` to react to its clients coming and going; the
 * defaults are no-ops.
 */
export abstract class BasePlugin {
  /** Stable URL identity of this plugin (read from the class's `static id`). */
  readonly id: string;
  /** The abstract plugin contract (never the concrete server plugin). */
  protected readonly plugin: PluginHost;

  private _photoshop: PsPhotoshopProxy | undefined;

  constructor(id: string, plugin: PluginHost) {
    this.id = id;
    this.plugin = plugin;
  }

  /** Feature modules, reached by short key (shortcut for `this.plugin.modules`). */
  protected get modules(): PluginHost["modules"] {
    return this.plugin.modules;
  }

  /**
   * The jsx runner scoped to this plugin's own `jsx/` dir (shortcut for
   * `this.plugin.jsx`, RFC 0005). `jsx.execute("x")` runs `<pluginRoot>/jsx/x.jsx`;
   * `jsx.executeBuiltin("Document/getDocumentInfo")` reaches the host's built-in
   * tree.
   */
  protected get jsx(): JsxRunnerApi {
    return this.plugin.jsx;
  }

  /**
   * Plugin event facade (shortcut for `this.plugin.events`). It listens to
   * Photoshop events, main plugin events, and this plugin's local event scope;
   * `emit` always publishes to this plugin's local scope.
   */
  protected get events(): PluginEvents {
    return this.plugin.events;
  }

  /**
   * Photoshop DOM proxy, a typed object wrapper over `this.jsx`. Read and write
   * the live document through `this.photoshop.app` / `this.photoshop.activeDocument`
   * (e.g. `await this.photoshop.activeDocument.name`) instead of hand-writing
   * ExtendScript. Lazily built once and backed by this plugin's own jsx runner;
   * drop to `this.jsx.run(...)` for anything the proxy does not cover.
   */
  protected get photoshop(): PsPhotoshopProxy {
    return (this._photoshop ??= new PsPhotoshopProxy(this.jsx));
  }

  /** Called after a client handshake registers with this plugin. Default no-op. */
  onConnect(_clientId: string): void {}

  /** Called after a client socket is removed from this plugin. Default no-op. */
  onDisconnect(_clientId: string): void {}

  /** Called during host shutdown before event resources are disposed. */
  onDispose?(): void | Promise<void>;
}

// Stamp the brand on the prototype (inherited by every subclass) so the loader's
// isBasePluginClass check works across separately-bundled SDK copies.
Object.defineProperty(BasePlugin.prototype, BASE_PLUGIN_BRAND, {
  value: true,
  enumerable: false,
  configurable: false,
  writable: false,
});

/**
 * Whether `S` is a class that extends BasePlugin. Uses the global brand rather
 * than `instanceof` so it works when `S` came from a separately-bundled copy of
 * this SDK (external plugins). The brand is inherited via the prototype chain,
 * so direct and indirect subclasses both qualify.
 */
export function isBasePluginClass(S: unknown): boolean {
  if (typeof S !== "function") return false;
  const proto = (S as { prototype?: unknown }).prototype;
  return proto != null && Boolean((proto as Record<symbol, unknown>)[BASE_PLUGIN_BRAND]);
}
