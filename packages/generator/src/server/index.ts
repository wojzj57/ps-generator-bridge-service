import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { parseFrame, serializeFrame } from "@ps-generator-bridge/sdk";
import { Registry } from "./registry";
import { registerBuiltins } from "./builtins";
import { PluginManager, type PluginEntry, type PluginInfo } from "../plugins";
import type { ConnectionSession, HandlerContext } from "./dispatch";
import { ClientStore } from "../utils/clientStore";
import { setGeneratorLogger, useLogger, type Logger } from "@ps-generator-bridge/sdk/plugin";
import type { PsGenerator } from "../types/generator";
import type { JsxRunnerApi } from "../utils/jsxRunner";
import { EventManager, RuntimeEventManager, type EventEndpointScope } from "../utils/eventManager";
import { bridgeError } from "../errors";

const log = useLogger("server");

/** Port the plugin/dev-server fall back to when no port is configured. */
export const DEFAULT_PORT = 7700;

export interface StartServerOptions {
  /** Port to listen on. Use 0 for an ephemeral port (tests). */
  port: number;
  host?: string;
  generator: PsGenerator;
  jsx?: JsxRunnerApi;
  events?: EventManager;
  runtimeEvents?: RuntimeEventManager;
  logger: Logger;
}

export interface PsBridgeServer {
  /** The bound port (resolved after `listen()`; 0 before). */
  readonly port: number;
  /** Global assembly seam: modules + builtins register here before `listen()`. */
  readonly registry: Registry;
  /** Per-plugin manager: the host registers each plugin here before `listen()`. */
  readonly pluginManager: PluginManager;
  /** Start listening. All HTTP/WS routes must be registered before this (fastify). */
  listen(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Build the server (fastify + plugin manager + routes) **without listening**, so the
 * caller (host) can register modules and plugins before `listen()` — fastify
 * requires all HTTP routes up front (ADR 0006). `/health` is a liveness probe;
 * `GET /plugins` lists loaded plugins; the protocol WebSocket lives at
 * `/ws/{pluginId}` and performs the clientId handshake (ADR 0007 / RFC 0004).
 *
 * The single param route `/ws/:pluginId` serves every plugin: it looks the
 * plugin up in the manager, handshakes against that plugin's own ClientStore, and
 * dispatches scoped-first with global fallback. An unknown plugin id gets an
 * error frame then a close (not a bare 404).
 */
export function createServer(options: StartServerOptions): PsBridgeServer {
  const { port, host = "127.0.0.1", generator, jsx, events } = options;
  setGeneratorLogger(options.logger);

  // Fastify's own pino logger is disabled: server logs flow through the bridge
  // logger, keeping one log format (ADR 0003).
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  let boundPort = 0;

  const runtimeEvents =
    options.runtimeEvents ?? new RuntimeEventManager(events ?? new EventManager(generator));
  const pluginManager = new PluginManager(app, runtimeEvents);
  const registry = new Registry(app, runtimeEvents);
  registerBuiltins(registry, () => pluginManager.list());
  const rootClients = new ClientStore();

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/plugins", async () => ({ plugins: pluginManager.list() }));
  app.get("/plugins/:id/health", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const health = pluginManager.health(id);
    if (!health) {
      return reply
        .code(404)
        .send({ ...bridgeError.pluginNotFound(id).toProtocolError(), pluginId: id });
    }
    return health;
  });

  // websocket must register before the /ws route; the nested plugin guarantees
  // that boot order without awaiting (this function stays synchronous).
  app.register(websocket);
  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
      const query = req.query as { id?: string } | undefined;
      const requested = query?.id;
      const clientId = requested && requested.length > 0 ? requested : randomUUID();
      rootClients.add(clientId, socket);
      log.info(`client connected: ${clientId} -> root`);
      socket.send(serializeFrame({ type: "connected", data: { clientId } }));

      const session = createEventSession({
        clientId,
        clients: rootClients,
        events: runtimeEvents,
        scope: { kind: "root" },
      });
      const ctx: HandlerContext = { generator, jsx, session };

      socket.on("message", (data) => {
        void handleRootFrame(socket, String(data), registry, ctx);
      });
      socket.on("close", () => {
        const removed = rootClients.remove(clientId, socket);
        rootClients.releaseSubscriptions(removed);
        log.info(`client disconnected: ${clientId} -> root`);
      });
      socket.on("error", (error) => log.error("socket error", error));
    });

    instance.get("/ws/:pluginId", { websocket: true }, (socket: WebSocket, req) => {
      const pluginId = (req.params as { pluginId: string }).pluginId;
      const entry = pluginManager.get(pluginId);
      if (!entry) {
        socket.send(
          serializeFrame({
            type: "error",
            data: { ...bridgeError.pluginNotFound(pluginId).toProtocolError(), pluginId },
          })
        );
        socket.close();
        return;
      }
      const query = req.query as { id?: string } | undefined;
      const requested = query?.id;
      const clientId = requested && requested.length > 0 ? requested : randomUUID();
      entry.clients.add(clientId, socket);
      entry.plugin.onConnect(clientId);
      log.info(`client connected: ${clientId} -> plugin ${pluginId}`);
      // First frame after connect is the handshake Event carrying the clientId.
      socket.send(serializeFrame({ type: "connected", data: { clientId } }));
      const session = createEventSession({
        clientId,
        clients: entry.clients,
        events: runtimeEvents,
        scope: { kind: "plugin", pluginId },
      });
      const ctx: HandlerContext = { generator, jsx, session };

      socket.on("message", (data) => {
        void handlePluginFrame(socket, String(data), entry, registry, ctx);
      });
      socket.on("close", () => {
        const removed = entry.clients.remove(clientId, socket);
        entry.clients.releaseSubscriptions(removed);
        entry.plugin.onDisconnect(clientId);
        log.info(`client disconnected: ${clientId} -> plugin ${pluginId}`);
      });
      socket.on("error", (error) => log.error("socket error", error));
    });
  });

  return {
    get port() {
      return boundPort;
    },
    registry,
    pluginManager,
    listen: async () => {
      await app.listen({ port, host });
      const address = app.server.address();
      boundPort = typeof address === "object" && address ? address.port : port;
      log.info(
        `PS Generator Bridge server listening on http://${host}:${boundPort} (ws + /health + /plugins)`
      );
    },
    close: () => app.close(),
  };
}

async function handleRootFrame(
  socket: WebSocket,
  data: string,
  registry: Registry,
  ctx: HandlerContext
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = parseFrame(data);
  } catch {
    log.warn("dropping non-JSON frame");
    return;
  }
  const response = await registry.dispatch(parsed, ctx);
  if (response) {
    socket.send(serializeFrame(response));
  }
}

/**
 * Convenience: build + listen in one call. Used by the dev-server and tests.
 */
export async function startServer(options: StartServerOptions): Promise<PsBridgeServer> {
  const server = createServer(options);
  await server.listen();
  return server;
}

async function handlePluginFrame(
  socket: WebSocket,
  data: string,
  entry: PluginEntry,
  registry: Registry,
  ctx: HandlerContext
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = parseFrame(data);
  } catch {
    log.warn("dropping non-JSON frame");
    return;
  }
  // Scoped first, global fallback. tryDispatch returns undefined when no scoped
  // handler matches (or the frame is not a request); registry.dispatch then
  // handles modules/builtins or returns UnknownMethod.
  const response =
    (await entry.scoped.tryDispatch(parsed, ctx)) ?? (await registry.dispatch(parsed, ctx));
  if (response) {
    socket.send(serializeFrame(response));
  }
}

// Re-export so callers that previously imported this from here keep working.
export type { PluginInfo };

function createEventSession(options: {
  clientId: string;
  clients: ClientStore;
  events: RuntimeEventManager;
  scope: EventEndpointScope;
}): ConnectionSession {
  return {
    clientId: options.clientId,
    scope: options.scope,
    subscribe: (type) => {
      return options.events.subscribeRemote({
        scope: options.scope,
        clientId: options.clientId,
        clients: options.clients,
        type,
      });
    },
    unsubscribe: (type) => {
      options.events.unsubscribeRemote({
        scope: options.scope,
        clientId: options.clientId,
        clients: options.clients,
        type,
      });
    },
  };
}
