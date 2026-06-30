import { describe, it, expect } from "vitest";
import {
  serializeFrame,
  parseFrame,
  PROTOCOL_VERSION,
  ProtocolMethod,
  ErrorCode,
  isRequest,
  isResponse,
  isEvent,
} from "../src/protocol";

describe("protocol", () => {
  it("round-trips a frame", () => {
    const envelope = { id: "1", method: "getServerInfo", params: {} };
    expect(parseFrame(serializeFrame(envelope))).toEqual(envelope);
  });

  it("exposes a positive protocol version and stable error codes", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(ErrorCode.UnknownMethod).toBe("UNKNOWN_METHOD");
    expect(ErrorCode.Internal).toBe("INTERNAL");
  });

  it("centralizes built-in Request method names", () => {
    expect(ProtocolMethod.ActionAutoCutout).toBe("action:autoCutout");
    expect(ProtocolMethod.ActionRemoveBackground).toBe("action:removeBackground");
    expect(ProtocolMethod.LayerGetInfo).toBe("layer:getInfo");
    expect(ProtocolMethod.DocumentCurrent).toBe("document:current");
    expect(ProtocolMethod.DocumentExport).toBe("document:export");
    expect(ProtocolMethod.DocumentSave).toBe("document:save");
  });

  it("keeps only server-level error codes (RFC 0006 shrinks SidePaint codes out)", () => {
    expect(ErrorCode.BadRequest).toBe("BAD_REQUEST");
    const codes = ErrorCode as Record<string, string>;
    expect(codes.PaintGone).toBeUndefined();
    expect(codes.ImportFailed).toBeUndefined();
    expect(codes.ValueResolve).toBeUndefined();
    expect(codes.UnsupportedScheme).toBeUndefined();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseFrame("{not json")).toThrow();
  });
});

describe("frame discriminators", () => {
  const request = { id: "1", method: "getServerInfo", params: {} };
  const okResponse = { id: "1", ok: true, result: {} };
  const errResponse = { id: "1", ok: false, error: { code: "INTERNAL", message: "x" } };
  const event = { type: "connected", data: { clientId: "c1" } };

  it("classifies each envelope kind by its own guard only", () => {
    expect(isRequest(request)).toBe(true);
    expect(isResponse(request)).toBe(false);
    expect(isEvent(request)).toBe(false);

    expect(isResponse(okResponse)).toBe(true);
    expect(isResponse(errResponse)).toBe(true);
    expect(isRequest(okResponse)).toBe(false);
    expect(isEvent(okResponse)).toBe(false);

    expect(isEvent(event)).toBe(true);
    expect(isRequest(event)).toBe(false);
    expect(isResponse(event)).toBe(false);
  });

  it("rejects non-object and malformed frames", () => {
    for (const guard of [isRequest, isResponse, isEvent]) {
      expect(guard(null)).toBe(false);
      expect(guard("string")).toBe(false);
      expect(guard(42)).toBe(false);
      expect(guard({})).toBe(false);
    }
  });
});
