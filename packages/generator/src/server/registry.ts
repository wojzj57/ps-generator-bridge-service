import type { HTTPMethods, RouteHandlerMethod } from "fastify";
import { isRequest, type ResponseEnvelope } from "@ps-generator-bridge/sdk";
import type { AssemblyTarget, MethodHandler, ApiRouteSpec } from "@ps-generator-bridge/sdk/plugin";
import { unknownMethodResponse, type HandlerContext } from "./dispatch";
import type { FastifyInstance } from "fastify";
import { MethodTable } from "./methodTable";

/**
 * Assembly seam between modules/builtins and the server (ADR 0006 / RFC 0004).
 * Holds the **global** WS Request method table (modules + builtins, including
 * `getServerInfo`) and forwards HTTP routes to fastify. This is the global
 * fallback for per-plugin dispatch: a `/ws/{pluginId}` connection tries the
 * plugin's scoped table first, then falls back here.
 *
 * HTTP routes may only be registered before `listen()` (fastify limitation); WS
 * methods may be added at runtime. Implements the SDK `AssemblyTarget` so
 * `bootstrap(module, registry)` (from `@ps-generator-bridge/sdk/plugin`) works
 * against the same shape the per-plugin scoped assembler implements.
 */
export class Registry implements AssemblyTarget {
  private readonly methods = new MethodTable();

  /**
   * Reserved first path segments (plugin ids). Set by the plugin after plugins
   * are registered and before modules bootstrap, so a module `@api` whose first
   * segment collides with a plugin id fails loud at init (RFC 0004).
   */
  reservedSegments: Set<string> = new Set();

  constructor(private readonly app: FastifyInstance) {}

  /** Register (or replace) a WS Request handler. Runtime-capable. */
  registerMethod(method: string, handler: MethodHandler): void {
    this.methods.register(method, handler);
  }

  /**
   * Register an HTTP route. Must run before `listen()` (fastify). The handler is
   * the devkit's opaque `ApiHandler`; cast to fastify's `RouteHandlerMethod` at
   * this boundary. Throws if the route's first segment is a reserved plugin id.
   */
  registerApi(route: ApiRouteSpec): void {
    const first = firstSegment(route.url);
    if (first !== undefined && this.reservedSegments.has(first)) {
      throw new Error(`module @api '${route.url}' collides with reserved plugin id '${first}'`);
    }
    this.app.route({
      method: route.method as HTTPMethods | HTTPMethods[],
      url: route.url,
      handler: route.handler as RouteHandlerMethod,
    });
  }

  /**
   * Route one parsed frame to its method handler, producing a response envelope.
   * Returns `undefined` for non-request frames (nothing to respond to). This is
   * the global fallback; per-plugin connections try the scoped table first.
   */
  async dispatch(message: unknown, ctx: HandlerContext): Promise<ResponseEnvelope | undefined> {
    if (!isRequest(message)) {
      return undefined;
    }
    const response = await this.methods.tryDispatch(message, ctx);
    if (!response) {
      return unknownMethodResponse(message.id, message.method);
    }
    return response;
  }
}

/** The first non-empty path segment of a URL, or `undefined` for a bare root. */
function firstSegment(url: string): string | undefined {
  const match = url.match(/^\/([^/?#]+)/);
  return match ? (match[1] as string) : undefined;
}
