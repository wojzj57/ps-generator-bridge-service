/**
 * Minimal HTTP vocabulary for the @api decorator (ADR 0006 / RFC 0003). The SDK
 * plugin subpath is platform-neutral and must not depend on fastify, so it
 * declares its own string union; the server adapts it to fastify's HTTPMethods
 * at the assembly boundary.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Runtime identity supplied by the server to every WebSocket method handler. */
export interface WsHandlerContext {
  /** Stable logical client identity, preserved when the SDK reconnects. */
  readonly clientId: string;
}

/**
 * A WS Request handler as seen by the plugin devkit (ADR 0006 open-ended
 * contract). params/result are `unknown` at this layer; the SDK re-applies
 * strong types for declared methods. The server supplies the authoritative
 * connection identity through `ctx.clientId`.
 */
export type MethodHandler = (params: unknown, ctx: WsHandlerContext) => Promise<unknown> | unknown;

/**
 * An HTTP route handler as seen by the plugin devkit. request/reply are opaque
 * (platform-neutral SDK); the server casts to fastify's request/reply at the
 * assembly boundary.
 */
export type ApiHandler = (request: unknown, reply: unknown) => Promise<unknown> | unknown;

/** An HTTP route a module or plugin exposes via @api (ADR 0006). */
export interface ApiRouteSpec {
  method: HttpMethod | HttpMethod[];
  url: string;
  handler: ApiHandler;
}

export type SubscribableDisposer = () => void | Promise<void>;

export interface SubscribableContext<T = unknown> {
  emit(payload: T): void;
}

export type SubscribableProducer<T = unknown> = (
  context: SubscribableContext<T>
) => void | SubscribableDisposer | Promise<void | SubscribableDisposer>;

/**
 * Abstract assembly target (ADR 0006 / RFC 0003): the second-stage bootstrap
 * registers scanned @ws/@api metadata against this. The server provides two
 * concrete implementations — the global Registry (modules + builtins) and a
 * per-plugin scoped assembler (RFC 0004). The SDK only depends on this shape,
 * keeping the dependency arrow server -> sdk / plugin -> sdk acyclic.
 */
export interface AssemblyTarget {
  registerMethod(name: string, handler: MethodHandler): void;
  registerApi(route: ApiRouteSpec): void;
  registerSubscribable(type: string, producer: SubscribableProducer): void;
}
