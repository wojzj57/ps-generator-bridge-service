import type { PluginHost } from "./host";
import type { ApiHandler, HttpMethod, MethodHandler } from "./types";

export type PluginApiRoute = string | { method?: HttpMethod | HttpMethod[]; url: string };

/**
 * Stable host-owned context passed to a third-party plugin initializer.
 * Registrations are accepted only while the synchronous initializer is running.
 */
export interface PluginInitContext {
  readonly pluginId: string;
  readonly host: PluginHost;
  ws(name: string, handler: MethodHandler): void;
  api(url: string, handler: ApiHandler): void;
  api(route: Exclude<PluginApiRoute, string>, handler: ApiHandler): void;
}

/** Structural runtime contract returned by a plugin initializer. */
export interface PluginRuntime {
  /** Optional mirror of the resolved package/initializer id. */
  readonly pluginId?: string;
  onConnect?(clientId: string): void;
  onDisconnect?(clientId: string): void;
  onDispose?(): void | Promise<void>;
}

/** A plugin package's default export. Initializers are deliberately synchronous. */
export interface PluginInitializer {
  (context: PluginInitContext): PluginRuntime;
  readonly pluginId?: string;
}

/**
 * Attach an id to an initializer when the package chooses to declare its
 * identity in code instead of package.json.
 */
export function definePlugin(pluginId: string, init: PluginInitializer): PluginInitializer {
  Object.defineProperty(init, "pluginId", {
    value: pluginId,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return init;
}
