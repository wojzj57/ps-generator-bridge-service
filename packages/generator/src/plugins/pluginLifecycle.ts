import type { ProtocolError } from "@ps-generator-bridge/sdk";
import { useLogger, type BasePlugin } from "@ps-generator-bridge/sdk/plugin";
import { bridgeError } from "../errors";

const log = useLogger("plugin-lifecycle");

export type PluginLifecyclePhase = "onConnect" | "onDisconnect" | "onDispose";

export type PluginLifecycleResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: ProtocolError }>;

export interface PluginLifecycleBoundaryOptions {
  onFailure: (error: ProtocolError) => void;
}

/**
 * The only boundary that invokes third-party plugin lifecycle hooks. Hook
 * failures become protocol diagnostics and never escape into Fastify, timers,
 * or host shutdown.
 */
export class PluginLifecycleBoundary {
  private disposed = false;

  constructor(
    readonly plugin: BasePlugin,
    private readonly options: PluginLifecycleBoundaryOptions
  ) {}

  connect(clientId: string): PluginLifecycleResult {
    try {
      this.plugin.onConnect(clientId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.failure("onConnect", error, true) };
    }
  }

  disconnect(clientId: string): void {
    try {
      this.plugin.onDisconnect(clientId);
    } catch (error) {
      this.failure("onDisconnect", error, true);
    }
  }

  async dispose(reportFailure = true): Promise<ProtocolError | undefined> {
    if (this.disposed) return undefined;
    this.disposed = true;
    try {
      await this.plugin.onDispose?.();
      return undefined;
    } catch (error) {
      return this.failure("onDispose", error, reportFailure);
    }
  }

  private failure(phase: PluginLifecyclePhase, cause: unknown, report: boolean): ProtocolError {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const error = {
      ...bridgeError.pluginLifecycleFailed(this.plugin.id, phase, reason).toProtocolError(),
      pluginId: this.plugin.id,
    };
    log.error(`${this.plugin.id}.${phase} failed`, cause);
    if (report) this.options.onFailure(error);
    return error;
  }
}
