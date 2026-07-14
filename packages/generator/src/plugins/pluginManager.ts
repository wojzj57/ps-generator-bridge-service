import type { FastifyInstance, HTTPMethods, RouteHandlerMethod } from "fastify";
import type { PluginHealth, ProtocolError } from "@ps-generator-bridge/sdk";
import type { BasePlugin } from "@ps-generator-bridge/sdk/plugin";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { SessionStore } from "../server/connectionSession";
import { ScopedRegistry } from "./scopedRegistry";
import type { RuntimeEventManager } from "../utils/eventManager";

/** One loaded plugin's runtime state: the instance, scoped table, and sessions. */
export interface PluginEntry {
  plugin: BasePlugin;
  scoped: ScopedRegistry;
  sessions: SessionStore;
  loadedAt: number;
}

/** One entry in the `GET /plugins` discovery list (RFC 0004). */
export interface PluginInfo {
  id: string;
}

export interface PluginFailure {
  id: string;
  lastError: ProtocolError;
}

/**
 * Owns the loaded plugins and their per-plugin runtime state (RFC 0004). Each
 * plugin gets its own scoped method table and SessionStore; `register` wires
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
  private readonly failures = new Map<string, PluginFailure>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly events: RuntimeEventManager,
    private readonly sessionResumeTtlMs: number
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

  health(id: string): PluginHealth | undefined {
    const entry = this.plugins.get(id);
    if (entry) {
      return {
        id,
        status: "loaded",
        clients: entry.sessions.count,
        loadedAt: entry.loadedAt,
        checks: { runtime: "ok" },
      };
    }

    const failure = this.failures.get(id);
    if (failure) {
      return {
        id,
        status: "failed",
        clients: 0,
        lastError: failure.lastError,
        checks: { load: "failed" },
      };
    }

    return undefined;
  }

  recordFailure(failure: PluginFailure): void {
    if (this.plugins.has(failure.id)) return;
    this.failures.set(failure.id, failure);
  }

  /** Release sockets, subscriptions, and resume timers during server shutdown. */
  clearSessions(): void {
    for (const entry of this.plugins.values()) entry.sessions.clear();
  }

  /**
   * Register a plugin: build its scoped table + SessionStore, create its event
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
    const sessions = new SessionStore({
      endpoint: Object.freeze({ kind: "plugin", pluginId: id }),
      events: this.events,
      resumeTtlMs: this.sessionResumeTtlMs,
      onDispose: (clientId) => plugin.onDisconnect(clientId),
    });
    this.events?.createPluginScope(id);
    bootstrap(plugin, scoped);

    for (const route of scoped.routes) {
      this.app.route({
        method: route.method as HTTPMethods | HTTPMethods[],
        url: `/${id}${route.url}`,
        handler: route.handler as RouteHandlerMethod,
      });
    }

    const entry: PluginEntry = { plugin, scoped, sessions, loadedAt: Date.now() };
    this.plugins.set(id, entry);
    this.failures.delete(id);
    return entry;
  }
}

/** A plugin id must be URL-safe and non-empty (RFC 0004 / 0005). */
export function isValidPluginId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}
