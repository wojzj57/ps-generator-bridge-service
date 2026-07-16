import type { ProtocolError } from "@ps-generator-bridge/sdk";
import { useLogger, type PluginRuntime } from "@ps-generator-bridge/sdk/plugin";
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
    readonly pluginId: string,
    readonly runtime: PluginRuntime,
    private readonly options: PluginLifecycleBoundaryOptions
  ) {}

  connect(clientId: string): PluginLifecycleResult {
    try {
      const result = this.runtime.onConnect?.(clientId);
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch((cause) =>
          log.error(`${this.pluginId}.onConnect rejected after returning a Promise`, cause)
        );
        throw new Error("onConnect must be synchronous");
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.failure("onConnect", error, true) };
    }
  }

  disconnect(clientId: string): void {
    try {
      const result = this.runtime.onDisconnect?.(clientId);
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch((cause) =>
          log.error(`${this.pluginId}.onDisconnect rejected after returning a Promise`, cause)
        );
        throw new Error("onDisconnect must be synchronous");
      }
    } catch (error) {
      this.failure("onDisconnect", error, true);
    }
  }

  async dispose(reportFailure = true): Promise<ProtocolError | undefined> {
    if (this.disposed) return undefined;
    this.disposed = true;
    try {
      await this.runtime.onDispose?.();
      return undefined;
    } catch (error) {
      return this.failure("onDispose", error, reportFailure);
    }
  }

  private failure(phase: PluginLifecyclePhase, cause: unknown, report: boolean): ProtocolError {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const error = {
      ...bridgeError.pluginLifecycleFailed(this.pluginId, phase, reason).toProtocolError(),
      pluginId: this.pluginId,
    };
    log.error(`${this.pluginId}.${phase} failed`, cause instanceof Error ? cause.stack : cause);
    if (report) this.options.onFailure(error);
    return error;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === "object" && value !== null) || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
