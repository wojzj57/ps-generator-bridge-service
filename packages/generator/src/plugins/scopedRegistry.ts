import type { ResponseEnvelope } from "@ps-generator-bridge/sdk";
import type {
  AssemblyTarget,
  MethodHandler,
  ApiRouteSpec,
  HttpMethod,
  SubscribableProducer,
} from "@ps-generator-bridge/sdk/plugin";
import { unknownMethodResponse, type HandlerContext } from "../server/dispatch";
import { MethodTable } from "../server/methodTable";

const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

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
  private readonly methodNames = new Set<string>();
  private readonly apiRoutes: ApiRouteSpec[] = [];
  private readonly apiRouteKeys = new Set<string>();

  registerMethod(name: string, handler: MethodHandler): void {
    if (name.length === 0) throw new Error("plugin WS method name must not be empty");
    if (typeof handler !== "function") {
      throw new Error(`plugin WS handler '${name}' must be a function`);
    }
    if (this.methodNames.has(name)) {
      throw new Error(`plugin WS method already registered: ${name}`);
    }
    this.methodNames.add(name);
    this.methods.register(name, handler);
  }

  registerApi(route: ApiRouteSpec): void {
    if (!route.url.startsWith("/")) {
      throw new Error(`plugin API route must start with '/': ${route.url}`);
    }
    if (typeof route.handler !== "function") {
      throw new Error(`plugin API handler '${route.url}' must be a function`);
    }
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.length === 0) throw new Error(`plugin API route has no methods: ${route.url}`);
    for (const method of methods) {
      if (!HTTP_METHODS.has(method)) {
        throw new Error(
          `plugin API route has unsupported method '${String(method)}': ${route.url}`
        );
      }
      const key = `${method} ${route.url}`;
      if (this.apiRouteKeys.has(key)) {
        throw new Error(`plugin API route already registered: ${key}`);
      }
    }
    for (const method of methods) this.apiRouteKeys.add(`${method} ${route.url}`);
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
