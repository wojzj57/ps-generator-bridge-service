import type { HttpMethod, ApiRouteSpec, AssemblyTarget } from "./types";

// Standard TC39 decorators stash metadata on the class under Symbol.metadata.
// Node (and PS's Node 18) lacks the well-known symbol at runtime, so we polyfill
// it once, before any decorated class is defined (this module is imported by
// every module/plugin file that uses @ws/@api). Verified to work under
// tsup/esbuild targeting node18. The symbol is captured into a typed const so
// the rest of the file does not depend on `Symbol.metadata` being present in the
// TS lib (target is ES2021).
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for("Symbol.metadata");
const METADATA = (Symbol as unknown as { metadata: symbol }).metadata;

// A *global* symbol so the devkit works across separately-bundled SDK copies:
// an external plugin bundles its own @ps-generator-bridge/sdk/plugin, so its
// @ws/@api decorator and the server's bootstrap must agree on the handler-stash
// key even though they are different module identities. A unique Symbol() would
// not match; Symbol.for is shared across bundles. The stash itself is still
// per-class (own-property on each class's metadata), so this introduces no
// cross-class leakage.
const HANDLERS = Symbol.for("ps-generator-bridge.handlers");

interface WsHandlerMeta {
  kind: "ws";
  name: string;
  methodKey: string;
}

interface ApiHandlerMeta {
  kind: "api";
  method: HttpMethod | HttpMethod[];
  url: string;
  methodKey: string;
}

type HandlerMeta = WsHandlerMeta | ApiHandlerMeta;

type MetadataLike = Record<string | symbol, unknown>;

// Push onto the *own* handler array of this class's metadata. `context.metadata`
// is prototype-chained to the base class, so without the own-property guard a
// subclass method would append into the base class's array.
function pushHandler(metadata: MetadataLike, meta: HandlerMeta): void {
  if (!Object.prototype.hasOwnProperty.call(metadata, HANDLERS)) {
    metadata[HANDLERS] = [];
  }
  (metadata[HANDLERS] as HandlerMeta[]).push(meta);
}

/** Mark a method as a WS Request handler registered under `name` (ADR 0006). */
export function ws(name: string) {
  return function (_value: unknown, context: ClassMethodDecoratorContext): void {
    pushHandler(context.metadata as MetadataLike, {
      kind: "ws",
      name,
      methodKey: String(context.name),
    });
  };
}

/**
 * Mark a method as an HTTP route handler. `@api("/path")` defaults to GET;
 * `@api({ method, url })` selects the verb(s) (ADR 0006). The route URL is
 * registered verbatim for modules (under `/{path}`) and prefixed with the
 * plugin id for plugins (under `/{pluginId}/{path}`, RFC 0004) — the
 * decorator only collects metadata; the assembly target decides the final URL.
 */
export function api(pathOrRoute: string | { method?: HttpMethod | HttpMethod[]; url: string }) {
  const route =
    typeof pathOrRoute === "string"
      ? { method: "GET" as HttpMethod, url: pathOrRoute }
      : { method: pathOrRoute.method ?? ("GET" as HttpMethod), url: pathOrRoute.url };
  return function (_value: unknown, context: ClassMethodDecoratorContext): void {
    pushHandler(context.metadata as MetadataLike, {
      kind: "api",
      method: route.method,
      url: route.url,
      methodKey: String(context.name),
    });
  };
}

/**
 * Second stage of decorator registration (ADR 0006 / 0009): scan a module or
 * plugin instance's collected metadata and register each decorated method
 * against the assembly target, bound to the instance so handlers can reach
 * `this`. Walks the metadata prototype chain so inherited handlers are included.
 * The `@ws`/`@api` name is registered verbatim — developers write the full
 * `Domain:action` name; no namespace is injected. For a plugin, the target is
 * the per-plugin scoped assembler (RFC 0004); for a module, the global Registry.
 */
export function bootstrap(instance: object, target: AssemblyTarget): void {
  const ctor = instance.constructor as unknown as Record<symbol, unknown>;
  const collected: HandlerMeta[] = [];
  let metadata = ctor[METADATA] as MetadataLike | undefined;
  while (metadata) {
    if (Object.prototype.hasOwnProperty.call(metadata, HANDLERS)) {
      collected.push(...(metadata[HANDLERS] as HandlerMeta[]));
    }
    metadata = Object.getPrototypeOf(metadata) as MetadataLike | undefined;
  }

  for (const meta of collected) {
    const fn = (instance as Record<string, unknown>)[meta.methodKey];
    if (typeof fn !== "function") continue;
    const bound = (fn as (...args: unknown[]) => unknown).bind(instance);
    if (meta.kind === "ws") {
      target.registerMethod(meta.name, bound);
    } else {
      target.registerApi({ method: meta.method, url: meta.url, handler: bound });
    }
  }
}
