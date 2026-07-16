import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import type { WebSocket } from "ws";
import { ErrorCode, SessionCloseCode, parseFrame, serializeFrame } from "@ps-generator-bridge/sdk";
import { Registry } from "./registry";
import { registerBuiltins } from "./builtins";
import { PluginManager, type PluginEntry, type PluginInfo } from "../plugins";
import type { HandlerContext } from "./dispatch";
import {
  DEFAULT_SESSION_RESUME_TTL_MS,
  SessionStore,
  type ConnectionSession,
} from "./connectionSession";
import { setGeneratorLogger, useLogger, type Logger } from "@ps-generator-bridge/sdk/plugin";
import type { PsGenerator } from "../types/generator";
import type { JsxRunnerApi } from "../utils/jsxRunner";
import { EventManager, RuntimeEventManager } from "../utils/eventManager";
import { bridgeError, toProtocolError } from "../errors";

const log = useLogger("server");
const PLUGIN_FAILURE_CLOSE_CODE = 1011;

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
  /** How long an unexpectedly disconnected logical session remains resumable. */
  sessionResumeTtlMs?: number;
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
 * plugin up in the manager, handshakes against that plugin's own SessionStore, and
 * dispatches scoped-first with global fallback. An unknown plugin id gets an
 * error frame then a close (not a bare 404).
 */
export function createServer(options: StartServerOptions): PsBridgeServer {
  const {
    port,
    host = "127.0.0.1",
    generator,
    jsx,
    events,
    sessionResumeTtlMs = DEFAULT_SESSION_RESUME_TTL_MS,
  } = options;
  setGeneratorLogger(options.logger);

  // Fastify's own pino logger is disabled: server logs flow through the bridge
  // logger, keeping one log format (ADR 0003).
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  app.setErrorHandler((error, _request, reply) => {
    const clientErrorStatus = getClientErrorStatus(error);
    if (clientErrorStatus !== undefined) {
      reply.code(clientErrorStatus).send(bridgeError.badRequest(error.message).toProtocolError());
      return;
    }
    const protocolError = toProtocolError(error);
    reply.code(statusForProtocolError(protocolError.code)).send(protocolError);
  });
  let boundPort = 0;

  const runtimeEvents =
    options.runtimeEvents ?? new RuntimeEventManager(events ?? new EventManager(generator));
  const pluginManager = new PluginManager(app, runtimeEvents, sessionResumeTtlMs);
  const registry = new Registry(app, runtimeEvents);
  registerBuiltins(registry, () => pluginManager.list());
  const rootSessions = new SessionStore({
    endpoint: Object.freeze({ kind: "root" }),
    events: runtimeEvents,
    resumeTtlMs: sessionResumeTtlMs,
  });

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
      const { session } = rootSessions.connect(resumeFromQuery(req.query), socket);
      log.info(`client connected: ${session.clientId} -> root`);
      socket.send(serializeFrame({ type: "connected", data: { clientId: session.clientId } }));

      const ctx: HandlerContext = { generator, jsx, session, clientId: session.clientId };

      socket.on("message", (data) => {
        if (!session.isCurrentSocket(socket)) return;
        void handleRootFrame(socket, String(data), registry, ctx);
      });
      socket.on("close", (code) => {
        const removed = rootSessions.disconnect(session, socket, code === SessionCloseCode.Dispose);
        if (removed) log.info(`client disconnected: ${session.clientId} -> root`);
      });
      socket.on("error", (error) => log.error("socket error", error));
    });

    instance.get("/ws/:pluginId", { websocket: true }, (socket: WebSocket, req) => {
      socket.on("error", (error) => log.error("socket error", error));
      const pluginId = (req.params as { pluginId: string }).pluginId;
      const entry = pluginManager.get(pluginId);
      if (!entry) {
        const failure = pluginManager.failure(pluginId);
        const error = failure?.lastError ?? {
          ...bridgeError.pluginNotFound(pluginId).toProtocolError(),
          pluginId,
        };
        socket.send(serializeFrame({ type: "error", data: error }));
        failure ? socket.close(PLUGIN_FAILURE_CLOSE_CODE, "plugin-unavailable") : socket.close();
        return;
      }
      const { session, created } = entry.sessions.connect(resumeFromQuery(req.query), socket);
      if (created) {
        const connected = entry.lifecycle.connect(session.clientId);
        if (!connected.ok) {
          try {
            socket.send(serializeFrame({ type: "error", data: connected.error }));
          } finally {
            entry.sessions.discard(session, socket);
            socket.close(PLUGIN_FAILURE_CLOSE_CODE, "plugin-onConnect-failed");
          }
          return;
        }
      }
      log.info(`client connected: ${session.clientId} -> plugin ${pluginId}`);
      // First frame after connect is the handshake Event carrying the clientId.
      socket.send(serializeFrame({ type: "connected", data: { clientId: session.clientId } }));
      const ctx: HandlerContext = { generator, jsx, session, clientId: session.clientId };

      socket.on("message", (data) => {
        if (!session.isCurrentSocket(socket)) return;
        void handlePluginFrame(socket, String(data), entry, registry, ctx);
      });
      socket.on("close", (code) => {
        const removed = entry.sessions.disconnect(
          session,
          socket,
          code === SessionCloseCode.Dispose
        );
        if (removed) {
          log.info(`client disconnected: ${session.clientId} -> plugin ${pluginId}`);
        }
      });
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
    close: async () => {
      rootSessions.clear();
      pluginManager.clearSessions();
      await pluginManager.disposeAll();
      await app.close();
    },
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
  if (response && ctx.session?.isCurrentSocket(socket)) {
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
  if (response && ctx.session?.isCurrentSocket(socket)) {
    socket.send(serializeFrame(response));
  }
}

// Re-export so callers that previously imported this from here keep working.
export type { PluginInfo };

function resumeFromQuery(query: unknown): unknown {
  if (typeof query !== "object" || query === null) return undefined;
  return (query as Record<string, unknown>).resume;
}

function statusForProtocolError(code: string): number {
  switch (code) {
    case ErrorCode.BadRequest:
      return 400;
    case ErrorCode.PluginNotFound:
    case ErrorCode.DocumentNotFound:
    case ErrorCode.LayerNotFound:
      return 404;
    case ErrorCode.NoDocument:
    case ErrorCode.PhotoshopBusy:
      return 409;
    case ErrorCode.PhotoshopUnavailable:
    case ErrorCode.PluginLoadFailed:
    case ErrorCode.PluginRegistrationFailed:
    case ErrorCode.PluginLifecycleFailed:
      return 503;
    default:
      return 500;
  }
}

function getClientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode < 500
    ? statusCode
    : undefined;
}
