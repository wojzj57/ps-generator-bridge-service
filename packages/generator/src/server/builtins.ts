import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { PLUGIN_NAME, PLUGIN_VERSION } from "../meta";
import type { Registry } from "./registry";
import type { HandlerContext } from "./dispatch";
import type { PluginInfo } from "./pluginManager";
import { bridgeError } from "../errors";

/**
 * Register the server's built-in protocol methods — always available, independent
 * of any module or plugin. `getServerInfo` is the minimal vertical slice
 * (protocol -> dispatch -> injected generator) and, since RFC 0004, also carries
 * the loaded-plugin discovery list.
 */
export function registerBuiltins(registry: Registry, plugins: () => PluginInfo[]): void {
  registry.registerMethod(ProtocolMethod.GetServerInfo, async (_params, ctx) => {
    const { generator } = ctx as HandlerContext;
    let psVersion: string | undefined;
    try {
      psVersion = await generator.getPhotoshopVersion();
    } catch {
      // Not connected to PS (e.g. the standalone dev-server) — omit psVersion.
      psVersion = undefined;
    }
    return { name: PLUGIN_NAME, version: PLUGIN_VERSION, psVersion, plugins: plugins() };
  });
  registry.registerMethod(ProtocolMethod.JsxRun, async (params, ctx) => {
    const context = ctx as HandlerContext;
    const { script } = params as { script?: unknown };
    if (typeof script !== "string") throw badRequest("script is required");
    if (!context.jsx) throw badRequest("jsx is not available");
    return context.jsx.run(script);
  });
  registry.registerMethod(ProtocolMethod.JsxExecute, async (params, ctx) => {
    const context = ctx as HandlerContext;
    const { name, params: jsxParams } = params as {
      name?: unknown;
      params?: Record<string, unknown>;
    };
    if (typeof name !== "string") throw badRequest("name is required");
    if (!context.jsx) throw badRequest("jsx is not available");
    return context.jsx.execute(name, jsxParams);
  });
  registry.registerMethod(ProtocolMethod.EventSubscribe, async (params, ctx) => {
    const context = ctx as HandlerContext;
    if (!context.session) throw badRequest("event subscription is only available on /ws");
    const { type } = params as { type?: unknown };
    if (typeof type !== "string") throw badRequest("type is required");
    context.session.subscribe(type);
    return { ok: true };
  });
  registry.registerMethod(ProtocolMethod.EventUnsubscribe, async (params, ctx) => {
    const context = ctx as HandlerContext;
    if (!context.session) throw badRequest("event subscription is only available on /ws");
    const { type } = params as { type?: unknown };
    if (typeof type !== "string") throw badRequest("type is required");
    context.session.unsubscribe(type);
    return { ok: true };
  });
}

function badRequest(message: string): Error {
  return bridgeError.badRequest(message);
}
