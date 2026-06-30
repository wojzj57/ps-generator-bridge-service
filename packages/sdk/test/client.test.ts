import { describe, it, expect } from "vitest";
import { PsBridgeClient } from "../src/client";
import { FakeTransport } from "./fakeTransport";
import type { RequestEnvelope } from "../src/protocol";

/** Flush the one microtask the client awaits (transport.ready) before it sends. */
const flush = () => Promise.resolve();

describe("PsBridgeClient", () => {
  it("getServerInfo sends a typed request and resolves with the result", async () => {
    const transport = new FakeTransport();
    const client = new PsBridgeClient({ transport });

    const promise = client.getServerInfo();
    await flush();

    const req = transport.lastSent() as RequestEnvelope<"getServerInfo">;
    expect(req.method).toBe("getServerInfo");
    expect(typeof req.id).toBe("string");

    transport.emit(
      JSON.stringify({ id: req.id, ok: true, result: { name: "x", version: "1.0.0" } })
    );
    await expect(promise).resolves.toEqual({ name: "x", version: "1.0.0" });
  });

  it("rejects on an error response", async () => {
    const transport = new FakeTransport();
    const client = new PsBridgeClient({ transport });
    const promise = client.getServerInfo();
    await flush();
    const req = transport.lastSent() as RequestEnvelope;
    transport.emit(
      JSON.stringify({ id: req.id, ok: false, error: { code: "INTERNAL", message: "boom" } })
    );
    await expect(promise).rejects.toThrow(/INTERNAL: boom/);
  });

  it("ignores non-JSON noise and unknown ids", async () => {
    const transport = new FakeTransport();
    const client = new PsBridgeClient({ transport });
    const promise = client.getServerInfo();
    await flush();
    const req = transport.lastSent() as RequestEnvelope;
    transport.emit("not json");
    transport.emit(JSON.stringify({ id: "someone-else", ok: true, result: {} }));
    transport.emit(JSON.stringify({ id: req.id, ok: true, result: { name: "x", version: "1" } }));
    await expect(promise).resolves.toEqual({ name: "x", version: "1" });
  });

  it("times out when no response arrives", async () => {
    const transport = new FakeTransport();
    const client = new PsBridgeClient({ transport, timeoutMs: 5 });
    await expect(client.getServerInfo()).rejects.toThrow(/timed out/);
  });

  it("requires either url or transport", () => {
    expect(() => new PsBridgeClient({})).toThrow(/url.*transport/);
  });

  it("close rejects pending requests and closes the transport", async () => {
    const transport = new FakeTransport();
    const client = new PsBridgeClient({ transport, timeoutMs: 1000 });
    const promise = client.getServerInfo();
    await flush();
    client.close();
    await expect(promise).rejects.toThrow(/closed/i);
    expect(transport.closed).toBe(true);
  });
});
