import { describe, expect, it, vi } from "vitest";
import { setGeneratorLogger, type PluginRuntime } from "@ps-generator-bridge/sdk/plugin";
import { PluginLifecycleBoundary } from "../src/plugins";

setGeneratorLogger({ debug() {}, info() {}, warn() {}, error() {} });

describe("PluginLifecycleBoundary", () => {
  it("rejects Promise-returning connect and disconnect hooks", () => {
    const onFailure = vi.fn();
    const runtime: PluginRuntime = {
      onConnect: (() => Promise.resolve()) as unknown as (clientId: string) => void,
      onDisconnect: (() => Promise.resolve()) as unknown as (clientId: string) => void,
    };
    const lifecycle = new PluginLifecycleBoundary("plain", runtime, { onFailure });

    expect(lifecycle.connect("client")).toMatchObject({
      ok: false,
      error: { details: { phase: "onConnect", reason: "onConnect must be synchronous" } },
    });
    lifecycle.disconnect("client");
    expect(onFailure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          phase: "onDisconnect",
          reason: "onDisconnect must be synchronous",
        }),
      })
    );
  });

  it("awaits an asynchronous onDispose exactly once", async () => {
    const dispose = vi.fn(async () => undefined);
    const lifecycle = new PluginLifecycleBoundary(
      "plain",
      { onDispose: dispose },
      {
        onFailure: vi.fn(),
      }
    );

    await lifecycle.dispose();
    await lifecycle.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
