import type { ResponseEnvelope } from "@ps-generator-bridge/sdk";
import type {
  AssemblyTarget,
  MethodHandler,
  ApiRouteSpec,
  SubscribableProducer,
} from "@ps-generator-bridge/sdk/plugin";
import { unknownMethodResponse, type HandlerContext } from "../server/dispatch";
import { MethodTable } from "../server/methodTable";

/**
 * Per-plugin scoped method table (RFC 0004). Implements the SDK AssemblyTarget
 * so `bootstrap(plugin, scopedRegistry)` registers a plugin's `@ws` handlers
 * here (not in the global Registry) and collects its `@api` routes for the
 * assembler to flush to fastify under `/{pluginId}/{path}`.
 *
 * Dispatch order on a `/ws/{pluginId}` connection is scoped-then-global: the
 * WS handler calls `tryDispatch` first; it returns `undefined` when no scoped
 * handler matches (or the frame is not a request), so the caller falls back to
 * the global Registry (modules + builtins). A scoped name that collides with a
 * global one overrides it (scoped wins).
 */
export class ScopedRegistry implements AssemblyTarget {
  private readonly methods = new MethodTable();
  private readonly apiRoutes: ApiRouteSpec[] = [];

  registerMethod(name: string, handler: MethodHandler): void {
    this.methods.register(name, handler);
  }

  registerApi(route: ApiRouteSpec): void {
    this.apiRoutes.push(route);
  }

  registerSubscribable(type: string, _producer: SubscribableProducer): void {
    throw new Error(`plugin @subscribable is not supported yet: ${type}`);
  }

  /** The `@api` routes bootstrap collected, for the assembler to flush to fastify. */
  get routes(): readonly ApiRouteSpec[] {
    return this.apiRoutes;
  }

  /**
   * Dispatch a frame against the scoped table. Returns `undefined` when there is
   * no scoped handler (caller falls back to the global Registry) or the frame is
   * not a request (nothing to respond to). A found handler always yields an
   * envelope — including an error envelope — so only "not in this table" falls
   * through.
   */
  async tryDispatch(message: unknown, ctx: HandlerContext): Promise<ResponseEnvelope | undefined> {
    return this.methods.tryDispatch(message, ctx);
  }
}

// Re-exported for the assembler, which builds the global UnknownMethod envelope
// when neither scoped nor global matched — though in practice the global
// Registry.dispatch already produces it. Kept here for dispatch symmetry.
export { unknownMethodResponse };
