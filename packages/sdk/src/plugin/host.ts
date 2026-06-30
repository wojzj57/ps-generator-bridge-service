import type {
  JsxRunnerApi,
  LayerModuleApi,
  DocumentModuleApi,
  ActionModuleApi,
  ImageModuleApi,
  CosServiceApi,
  PhotoshopEvents,
} from "@ps-generator-bridge/generator/contract";

/**
 * The plugin contract a Plugin depends on (RFC 0003) — a deliberately narrowed
 * view of the server's `PsBridgeHost`. Exposes only what a Plugin needs: the JSX
 * seam and the feature-module accessors (all typed by the generator's own
 * contract interfaces), plus the listen-only event stream. Excludes
 * broadcast/emit/server/the raw generator handle — a Plugin manages its own
 * clients through BasePlugin.broadcast/send.
 *
 * This is the one hand-written piece of the plugin surface that stays in the
 * SDK: it is a *curation* of the host, not a mirror of it. Its member types are
 * imported (type-only) from the generator contract so they can never drift from
 * the implementation. The server's `PsBridgeHost implements PluginHost`;
 * external Plugins only ever see this interface, so they depend on the SDK alone
 * at runtime, never on the server package.
 */
export interface PluginHost {
  readonly jsx: JsxRunnerApi;
  /** Feature modules, reached by short key (e.g. `plugin.modules.layer`). */
  readonly modules: {
    layer: LayerModuleApi;
    document: DocumentModuleApi;
    action: ActionModuleApi;
    image: ImageModuleApi;
  };
  /** Typed, listen-only Photoshop event stream (lazy subscribe). */
  readonly events: PhotoshopEvents;
  /**
   * Optional object-storage upload service (RFC 0008). Present only when the host
   * has COS configured via the environment; undefined otherwise. A plugin guards
   * on it: `if (this.plugin.cos) await this.plugin.cos.uploadObject(bytes)`.
   */
  readonly cos?: CosServiceApi;
}
