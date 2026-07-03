import type { FastifyInstance, HTTPMethods, RouteHandlerMethod } from "fastify";
import type { BasePlugin } from "@ps-generator-bridge/sdk/plugin";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { ClientStore } from "../utils/clientStore";
import { ScopedRegistry } from "./scopedRegistry";
import type { RuntimeEventManager } from "../utils/eventManager";

/** One loaded plugin's runtime state: the instance, its scoped table, its clients. */
export interface PluginEntry {
  plugin: BasePlugin;
  scoped: ScopedRegistry;
  clients: ClientStore;
}

/** One entry in the `GET /plugins` discovery list (RFC 0004). */
export interface PluginInfo {
  id: string;
}

/**
 * Owns the loaded plugins and their per-plugin runtime state (RFC 0004). Each
 * plugin gets its own scoped method table and ClientStore; `register` wires
 * them up: creates the plugin event scope, bootstraps the
 * plugin's `@ws`/`@api` metadata into the scoped table, and flushes `@api`
 * routes to fastify under `/{pluginId}/{path}`. All before `listen()`.
 *
 * The WS endpoint `/ws/{pluginId}` is a single param route owned by the server
 * (see `createServer`); it looks the plugin up here and dispatches scoped-first
 * with global fallback. This manager does not register WS routes itself.
 */
export class PluginManager {
  private readonly plugins = new Map<string, PluginEntry>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly events?: RuntimeEventManager
  ) {}

  /** All registered plugin ids, in registration order. */
  get ids(): string[] {
    return [...this.plugins.keys()];
  }

  /** The discovery list surfaced at `GET /plugins` and in `getServerInfo`. */
  list(): PluginInfo[] {
    return [...this.plugins.values()].map((e) => ({ id: e.plugin.id }));
  }

  /** Look up a loaded plugin by id (used by the `/ws/:pluginId` route). */
  get(id: string): PluginEntry | undefined {
    return this.plugins.get(id);
  }

  /**
   * Register a plugin: build its scoped table + ClientStore, create its event
   * scope, bootstrap its handlers, and flush its `@api` routes to fastify. Throws
   * on a duplicate or illegal id. Must run before `listen()`.
   */
  register(plugin: BasePlugin): PluginEntry {
    const id = plugin.id;
    if (!isValidPluginId(id)) {
      throw new Error(`illegal plugin id: '${id}' (must match [A-Za-z0-9_-]+)`);
    }
    if (this.plugins.has(id)) {
      throw new Error(`duplicate plugin id: ${id}`);
    }

    const scoped = new ScopedRegistry();
    const clients = new ClientStore();
    this.events?.createPluginScope(id);
    bootstrap(plugin, scoped);

    for (const route of scoped.routes) {
      this.app.route({
        method: route.method as HTTPMethods | HTTPMethods[],
        url: `/${id}${route.url}`,
        handler: route.handler as RouteHandlerMethod,
      });
    }

    const entry: PluginEntry = { plugin, scoped, clients };
    this.plugins.set(id, entry);
    return entry;
  }
}

/** A plugin id must be URL-safe and non-empty (RFC 0004 / 0005). */
export function isValidPluginId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}
