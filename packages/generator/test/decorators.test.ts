import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ws, api, bootstrap } from "@ps-generator-bridge/sdk/plugin";
import { Registry } from "../src/server/registry";
import { fakeGenerator } from "./fakeGenerator";

class SampleModule {
  greeting = "hi";

  @ws("echo")
  echo(params: unknown): unknown {
    return { echoed: params, via: this.greeting };
  }

  @api("/hello")
  async hello(): Promise<unknown> {
    return { hello: this.greeting };
  }
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("decorators + bootstrap", () => {
  it("registers @ws methods bound to the instance", async () => {
    app = Fastify({ logger: false });
    const registry = new Registry(app);
    bootstrap(new SampleModule(), registry);
    const res = await registry.dispatch(
      { id: "1", method: "echo", params: { n: 1 } },
      { generator: fakeGenerator(), clientId: "test-client" }
    );
    expect(res).toMatchObject({ id: "1", ok: true, result: { echoed: { n: 1 }, via: "hi" } });
  });

  it("registers @api routes bound to the instance", async () => {
    app = Fastify({ logger: false });
    const registry = new Registry(app);
    bootstrap(new SampleModule(), registry);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/hello`);
    expect(await response.json()).toEqual({ hello: "hi" });
  });

  it("does not leak handlers between unrelated classes", async () => {
    class Other {
      @ws("other")
      run(): string {
        return "ok";
      }
    }
    app = Fastify({ logger: false });
    const registry = new Registry(app);
    bootstrap(new Other(), registry);
    const ctx = { generator: fakeGenerator(), clientId: "test-client" };
    // 'echo' (from SampleModule) must NOT be registered on this registry.
    const echo = await registry.dispatch({ id: "2", method: "echo", params: {} }, ctx);
    expect(echo).toMatchObject({ ok: false, error: { code: "UNKNOWN_METHOD" } });
    const other = await registry.dispatch({ id: "3", method: "other", params: {} }, ctx);
    expect(other).toMatchObject({ id: "3", ok: true, result: "ok" });
  });
});
