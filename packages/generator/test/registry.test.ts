import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { ProtocolMethod, type MethodName } from "@ps-generator-bridge/sdk";
import { bridgeError } from "../src/errors";
import { Registry } from "../src/server/registry";
import { ScopedRegistry } from "../src/plugins";
import { registerBuiltins } from "../src/server/builtins";
import { fakeGenerator } from "./fakeGenerator";

function newRegistry(): Registry {
  // dispatch needs no listening server; a bare fastify instance suffices.
  return new Registry(Fastify({ logger: false }));
}

describe("Registry.dispatch", () => {
  it("keeps module method names in the Protocol method catalog", () => {
    const methods: MethodName[] = [
      ProtocolMethod.ActionAutoCutout,
      ProtocolMethod.ActionRemoveBackground,
      ProtocolMethod.LayerGetInfo,
      ProtocolMethod.LayerGetInfoById,
      ProtocolMethod.LayerGetInfoByIndex,
      ProtocolMethod.LayerGetInfoBySelectionIndex,
      ProtocolMethod.LayerGetCurrentPreview,
      ProtocolMethod.LayerImportImage,
      ProtocolMethod.DocumentCurrent,
      ProtocolMethod.DocumentExport,
      ProtocolMethod.DocumentSave,
      ProtocolMethod.ImageExportLayer,
      ProtocolMethod.ImageExportLayerWithSelectedPath,
      ProtocolMethod.ImageGetPreview,
      ProtocolMethod.ImageExportDocument,
      ProtocolMethod.SelectionGetArea,
      ProtocolMethod.SelectionGetPath,
      ProtocolMethod.SelectionWatch,
    ];
    expect(methods).toContain("action:autoCutout");
  });

  it("built-in getServerInfo returns name/version + psVersion from the generator", async () => {
    const registry = newRegistry();
    registerBuiltins(registry, () => []);
    const generator = fakeGenerator();
    generator.psVersion = "26.1.0";
    const res = await registry.dispatch(
      { id: "1", method: "getServerInfo", params: {} },
      { generator }
    );
    expect(res).toMatchObject({ id: "1", ok: true });
    if (res && res.ok) {
      expect(res.result).toMatchObject({ psVersion: "26.1.0" });
    }
  });

  it("omits psVersion when Photoshop is unavailable", async () => {
    const registry = newRegistry();
    registerBuiltins(registry, () => []);
    const generator = fakeGenerator();
    generator.getPhotoshopVersion = () => Promise.reject(new Error("no PS"));
    const res = await registry.dispatch(
      { id: "2", method: "getServerInfo", params: {} },
      { generator }
    );
    expect(res && res.ok && (res.result as { psVersion?: string }).psVersion).toBeUndefined();
  });

  it("routes a dynamically registered method", async () => {
    const registry = newRegistry();
    registry.registerMethod("echo", (params) => params);
    const res = await registry.dispatch(
      { id: "3", method: "echo", params: { hi: true } },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({ id: "3", ok: true, result: { hi: true } });
  });

  it("scoped registry uses the same method table but preserves miss fallback", async () => {
    const scoped = new ScopedRegistry();
    const ctx = { generator: fakeGenerator() };
    expect(
      await scoped.tryDispatch({ id: "s1", method: "missing", params: {} }, ctx)
    ).toBeUndefined();

    scoped.registerMethod("scoped:echo", (params) => params);
    const res = await scoped.tryDispatch(
      { id: "s2", method: "scoped:echo", params: { ok: true } },
      ctx
    );
    expect(res).toMatchObject({ id: "s2", ok: true, result: { ok: true } });
  });

  it("rejects malformed scoped API routes before Fastify registration", () => {
    const scoped = new ScopedRegistry();
    const handler = () => undefined;

    expect(() => scoped.registerApi({ method: "TRACE", url: "/trace", handler } as never)).toThrow(
      /unsupported method/
    );
    expect(() => scoped.registerApi({ method: [], url: "/empty", handler })).toThrow(
      /has no methods/
    );
  });

  it("surfaces a handler error as an INTERNAL response", async () => {
    const registry = newRegistry();
    registry.registerMethod("boom", () => {
      throw new Error("kaboom");
    });
    const res = await registry.dispatch(
      { id: "4", method: "boom", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({
      id: "4",
      ok: false,
      error: { code: "INTERNAL", message: "kaboom" },
    });
  });

  it("surfaces a typed error's code instead of INTERNAL when it is a known ErrorCode", async () => {
    const registry = newRegistry();
    const typed = new Error("no such paint") as Error & { code: string };
    typed.code = "PAINT_GONE";
    registry.registerMethod("ghost", () => {
      throw typed;
    });
    const res = await registry.dispatch(
      { id: "4b", method: "ghost", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({
      id: "4b",
      ok: false,
      error: { code: "PAINT_GONE", message: "no such paint" },
    });
  });

  it("surfaces an arbitrary string code verbatim (open-ended, RFC 0006)", async () => {
    const registry = newRegistry();
    const typed = new Error("weird") as Error & { code: string };
    typed.code = "NOT_A_REAL_CODE";
    registry.registerMethod("odd", () => {
      throw typed;
    });
    const res = await registry.dispatch(
      { id: "4c", method: "odd", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({
      id: "4c",
      ok: false,
      error: { code: "NOT_A_REAL_CODE", message: "weird" },
    });
  });

  it("falls back to INTERNAL when the thrown error has no string code", async () => {
    const registry = newRegistry();
    registry.registerMethod("plain", () => {
      throw new Error("no code here");
    });
    const res = await registry.dispatch(
      { id: "4d", method: "plain", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({
      id: "4d",
      ok: false,
      error: { code: "INTERNAL", message: "no code here" },
    });
  });

  it("normalizes BridgeError fields into the response error", async () => {
    const registry = newRegistry();
    registry.registerMethod("doc", () => {
      throw bridgeError.noDocument();
    });
    const res = await registry.dispatch(
      { id: "4e", method: "doc", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({
      id: "4e",
      ok: false,
      error: {
        code: "NO_DOCUMENT",
        source: "photoshop",
        retryable: false,
        requestId: "4e",
        method: "doc",
      },
    });
  });

  it("returns UNKNOWN_METHOD for an unregistered method", async () => {
    const registry = newRegistry();
    const res = await registry.dispatch(
      { id: "5", method: "nope", params: {} },
      { generator: fakeGenerator() }
    );
    expect(res).toMatchObject({ id: "5", ok: false, error: { code: "UNKNOWN_METHOD" } });
  });

  it("returns undefined for malformed frames (no id to respond to)", async () => {
    const registry = newRegistry();
    const ctx = { generator: fakeGenerator() };
    expect(await registry.dispatch({ method: "getServerInfo" }, ctx)).toBeUndefined();
    expect(await registry.dispatch("garbage", ctx)).toBeUndefined();
    expect(await registry.dispatch(null, ctx)).toBeUndefined();
  });
});
