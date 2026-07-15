import type { FastifyInstance, HTTPMethods } from "fastify";
import type { PluginHealth, ProtocolError } from "@ps-generator-bridge/sdk";
import type { ApiHandler, BasePlugin } from "@ps-generator-bridge/sdk/plugin";
import { bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { bridgeError } from "../errors";
import { SessionStore } from "../server/connectionSession";
import type { RuntimeEventManager } from "../utils/eventManager";
import { PluginLifecycleBoundary } from "./pluginLifecycle";
import { ScopedRegistry } from "./scopedRegistry";

export interface PluginRuntimeState {
  lastError?: ProtocolError;
}

interface RouteActivation {
  active: boolean;
  failure?: ProtocolError;
}

/** One loaded plugin's runtime state: the instance, scoped table, and sessions. */
export interface PluginEntry {
  plugin: BasePlugin;
  scoped: ScopedRegistry;
  sessions: SessionStore;
  lifecycle: PluginLifecycleBoundary;
  runtime: PluginRuntimeState;
  loadedAt: number;
}

/** One entry in the `GET /plugins` discovery list (RFC 0004). */
export interface PluginInfo {
  id: string;
}

export interface PluginFailure {
  id: string;
  lastError: ProtocolError;
  checks?: PluginHealth["checks"];
}

export type PluginRegistrationResult =
  | Readonly<{ ok: true; entry: PluginEntry }>
  | Readonly<{ ok: false; error: ProtocolError }>;

/**
 * Owns loaded plugins and their failure diagnostics. Registration is logically
 * transactional: routes stay behind an activation guard until every route has
 * registered, so a partial Fastify commit can never invoke a failed plugin.
 */
export class PluginManager {
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly failures = new Map<string, PluginFailure>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly events: RuntimeEventManager,
    private readonly sessionResumeTtlMs: number
  ) {}

  get ids(): string[] {
    return [...this.plugins.keys()];
  }

  list(): PluginInfo[] {
    return [...this.plugins.values()].map((entry) => ({ id: entry.plugin.id }));
  }

  get(id: string): PluginEntry | undefined {
    return this.plugins.get(id);
  }

  failure(id: string): PluginFailure | undefined {
    return this.failures.get(id);
  }

  health(id: string): PluginHealth | undefined {
    const entry = this.plugins.get(id);
    if (entry) {
      return {
        id,
        status: "loaded",
        clients: entry.sessions.count,
        loadedAt: entry.loadedAt,
        lastError: entry.runtime.lastError,
        checks: { runtime: entry.runtime.lastError ? "failed" : "ok" },
      };
    }

    const failure = this.failures.get(id);
    if (!failure) return undefined;
    return {
      id,
      status: "failed",
      clients: 0,
      lastError: failure.lastError,
      checks: failure.checks ?? { load: "failed" },
    };
  }

  recordFailure(failure: PluginFailure): void {
    if (this.plugins.has(failure.id)) return;
    this.failures.set(failure.id, failure);
  }

  clearSessions(): void {
    for (const entry of this.plugins.values()) entry.sessions.clear();
  }

  async disposeAll(): Promise<void> {
    for (const entry of [...this.plugins.values()].reverse()) {
      await entry.lifecycle.dispose();
    }
  }

  /**
   * Prepare and commit one plugin. Plugin-originated failures are returned and
   * recorded instead of escaping into host startup.
   */
  async register(plugin: BasePlugin): Promise<PluginRegistrationResult> {
    const id = plugin.id;
    const ownsEventResources = !this.plugins.has(id);
    const runtime: PluginRuntimeState = {};
    const lifecycle = new PluginLifecycleBoundary(plugin, {
      onFailure: (error) => {
        runtime.lastError = error;
      },
    });
    const activation: RouteActivation = { active: false };

    try {
      this.validateRegistrationId(id);
      const scoped = new ScopedRegistry();
      bootstrap(plugin, scoped);

      for (const route of scoped.routes) {
        const handler = route.handler;
        this.app.route({
          method: route.method as HTTPMethods | HTTPMethods[],
          url: `/${id}${route.url}`,
          handler: async (request, reply) => {
            if (!activation.active) {
              return reply.code(503).send(activation.failure);
            }
            return (handler as ApiHandler)(request, reply);
          },
        });
      }

      const sessions = new SessionStore({
        endpoint: Object.freeze({ kind: "plugin", pluginId: id }),
        events: this.events,
        resumeTtlMs: this.sessionResumeTtlMs,
        onDispose: (clientId) => lifecycle.disconnect(clientId),
      });
      this.events.createPluginScope(id);
      const entry: PluginEntry = {
        plugin,
        scoped,
        sessions,
        lifecycle,
        runtime,
        loadedAt: Date.now(),
      };
      this.plugins.set(id, entry);
      this.failures.delete(id);
      activation.active = true;
      return { ok: true, entry };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      const error: ProtocolError = {
        ...bridgeError.pluginRegistrationFailed(id, reason).toProtocolError(),
        pluginId: id,
      };
      activation.failure = error;
      await lifecycle.dispose(false);
      if (ownsEventResources) this.events.disposePlugin(id);
      this.recordFailure({
        id,
        lastError: error,
        checks: { load: "ok", registration: "failed" },
      });
      return { ok: false, error };
    }
  }

  private validateRegistrationId(id: string): void {
    if (!isValidPluginId(id)) {
      throw new Error(`illegal plugin id: '${id}' (must match [A-Za-z0-9_-]+)`);
    }
    if (this.plugins.has(id)) throw new Error(`duplicate plugin id: ${id}`);
  }
}

/** A plugin id must be URL-safe and non-empty (RFC 0004 / 0005). */
export function isValidPluginId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}
