import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { ProtocolMethod, RawConnection } from "@ps-generator-bridge/sdk";
import { BasePlugin, ws, bootstrap, type PluginHost } from "@ps-generator-bridge/sdk/plugin";
import { createServer, type PsBridgeServer } from "../src/server";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

// A fixture plugin exercising the SDK <-> server round trip over /ws/{id}.
class EchoService extends BasePlugin {
  static readonly id = "echo";

  @ws("echo:ping")
  ping(params: { n?: number }): { pong: number } {
    return { pong: params?.n ?? 0 };
  }

  publish(type: string, data: unknown): boolean {
    return this.events.emit(type, data);
  }
}

// A plain decorated module exercising global fallback from a plugin connection.
class GreetModule {
  @ws("greet")
  greet(params: { name?: string }): { hello: string } {
    return { hello: params?.name ?? "world" };
  }
}

let server: PsBridgeServer | undefined;
let conn: RawConnection | undefined;

afterEach(async () => {
  conn?.close();
  conn = undefined;
  await server?.close();
  server = undefined;
});

describe("end-to-end: Connection <-> per-plugin server", () => {
  it("handshakes on /ws/{id}, invokes scoped + fallback methods, and receives plugin events", async () => {
    const generator = fakeGenerator();
    const events = new RuntimeEventManager(new EventManager(generator));
    server = createServer({ port: 0, generator, runtimeEvents: events, logger: silentLogger });
    server.pluginManager.register(
      new EchoService("echo", {
        events: events.createPluginFacade("echo"),
      } as unknown as PluginHost)
    );
    bootstrap(new GreetModule(), server.registry);
    await server.listen();

    conn = new RawConnection({
      url: `ws://127.0.0.1:${server.port}/ws/echo`,
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    await conn.ready();
    expect(conn.clientId).toBeTruthy();

    // scoped @ws method on the plugin
    const pong = await conn.invoke("echo:ping", { n: 7 });
    expect(pong).toEqual({ pong: 7 });

    // module method via global fallback
    const greet = await conn.invoke("greet", { name: "ada" });
    expect(greet).toEqual({ hello: "ada" });

    // built-in via global fallback, carrying the plugin list
    const info = await conn.invoke("getServerInfo", {});
    expect(info).toMatchObject({ psVersion: "26.0.0", plugins: [{ id: "echo" }] });

    // plugin events are delivered after an explicit protocol subscription
    await conn.invoke(ProtocolMethod.EventSubscribe, { type: "tick" });
    const broadcastSeen = new Promise((resolve) => conn!.on("tick", resolve));
    (server.pluginManager.get("echo")!.plugin as EchoService).publish("tick", { n: 7 });
    expect(await broadcastSeen).toEqual({ n: 7 });
  });
});
