import type {
  JsxRunnerApi,
  LayerModuleApi,
  DocumentModuleApi,
  ActionModuleApi,
  ImageModuleApi,
  SelectionModuleApi,
  CosServiceApi,
  PluginEvents,
} from "@ps-generator-bridge/generator/contract";

/**
 * The plugin contract a Plugin depends on (RFC 0003): a deliberately narrowed
 * view of the server's `PsBridgeHost`. It exposes only what a Plugin needs: the
 * JSX seam, feature-module accessors, the plugin event facade, and optional COS.
 * It does not expose Fastify, the server, or the raw generator handle.
 */
export interface PluginHost {
  readonly jsx: JsxRunnerApi;
  /** Feature modules, reached by short key (e.g. `plugin.modules.layer`). */
  readonly modules: {
    layer: LayerModuleApi;
    document: DocumentModuleApi;
    action: ActionModuleApi;
    image: ImageModuleApi;
    selection: SelectionModuleApi;
  };
  /** Plugin event facade: listen to PS/main/local events and emit local events. */
  readonly events: PluginEvents;
  /**
   * Optional object-storage upload service (RFC 0008). Present only when the host
   * has COS configured via the environment.
   */
  readonly cos?: CosServiceApi;
}
