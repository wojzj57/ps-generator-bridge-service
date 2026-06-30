import type { FastifyInstance, HTTPMethods, RouteHandlerMethod } from "fastify";
import type { BasePlugin, PluginClientBus } from "@ps-generator-bridge/sdk/plugin";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { ClientStore } from "./clientStore";
import { ScopedRegistry } from "./scopedRegistry";

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
 * them up: attaches a PluginClientBus backed by the ClientStore, bootstraps the
 * plugin's `@ws`/`@api` metadata into the scoped table, and flushes `@api`
 * routes to fastify under `/{pluginId}/{path}`. All before `listen()`.
 *
 * The WS endpoint `/ws/{pluginId}` is a single param route owned by the server
 * (see `createServer`); it looks the plugin up here and dispatches scoped-first
 * with global fallback. This manager does not register WS routes itself.
 */
export class PluginManager {
  private readonly plugins = new Map<string, PluginEntry>();

  constructor(private readonly app: FastifyInstance) {}

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
   * Register a plugin: build its scoped table + ClientStore, attach the client
   * bus, bootstrap its handlers, and flush its `@api` routes to fastify. Throws
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
    const bus: PluginClientBus = {
      broadcast: (type, data) => clients.broadcast(type, data),
      send: (clientId, type, data) => clients.emit(clientId, type, data),
    };
    plugin._attachBus(bus);
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
