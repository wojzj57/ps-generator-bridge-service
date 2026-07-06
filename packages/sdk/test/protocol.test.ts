import { describe, it, expect } from "vitest";
import {
  serializeFrame,
  parseFrame,
  PROTOCOL_VERSION,
  MainEvent,
  MAIN_EVENTS,
  ProtocolMethod,
  ErrorCode,
  isRequest,
  isResponse,
  isEvent,
  type ProtocolError,
  type ProtocolMethods,
  type ProtocolEvents,
  type ErrorSource,
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
    expect(ErrorCode.NoDocument).toBe("NO_DOCUMENT");
    expect(ErrorCode.PhotoshopBusy).toBe("PHOTOSHOP_BUSY");
    expect(ErrorCode.PluginNotFound).toBe("PLUGIN_NOT_FOUND");
  });

  it("centralizes built-in Request method names", () => {
    expect(ProtocolMethod.ActionAutoCutout).toBe("action:autoCutout");
    expect(ProtocolMethod.ActionRemoveBackground).toBe("action:removeBackground");
    expect(ProtocolMethod.LayerGetInfo).toBe("layer:getInfo");
    expect(ProtocolMethod.LayerGetCurrentPreview).toBe("layer:getCurrentPreview");
    expect(ProtocolMethod.LayerImportImage).toBe("layer:importImage");
    expect(ProtocolMethod.DocumentCurrent).toBe("document:current");
    expect(ProtocolMethod.DocumentExport).toBe("document:export");
    expect(ProtocolMethod.DocumentSave).toBe("document:save");
    expect(ProtocolMethod.ImageExportLayerWithSelectedPath).toBe(
      "image:exportLayerWithSelectedPath"
    );
    expect(ProtocolMethod.SelectionGetArea).toBe("selection:getArea");
    expect(ProtocolMethod.SelectionGetPath).toBe("selection:getPath");
    expect(ProtocolMethod.SelectionWatch).toBe("selection:change");
  });

  it("allows subscribing arbitrary string event names", () => {
    const subscribe: ProtocolMethods[typeof ProtocolMethod.EventSubscribe]["params"] = {
      type: "paint:changed",
    };
    const main: ProtocolMethods[typeof ProtocolMethod.EventUnsubscribe]["params"] = {
      type: MainEvent.Ready,
    };

    expect(subscribe.type).toBe("paint:changed");
    expect(main.type).toBe(MainEvent.Ready);
  });

  it("models main plugin events in ProtocolEvents", () => {
    const ready: ProtocolEvents["#ready"] = {
      port: 7700,
      plugins: [{ id: "paint" }],
    };
    const closing: ProtocolEvents["#closing"] = { reason: "host-close" };

    expect(MainEvent.SelectionChanged).toBe("selection:changed");
    expect(MainEvent.LayerPreviewChange).toBe("layer:previewChange");
    expect(MainEvent.LayerSelectionChange).toBe("layer:selectionChange");
    expect(MAIN_EVENTS).toEqual([
      MainEvent.Ready,
      MainEvent.Closing,
      MainEvent.SelectionChanged,
      MainEvent.LayerPreviewChange,
      MainEvent.LayerSelectionChange,
    ]);
    expect(ready.plugins[0]?.id).toBe("paint");
    expect(closing.reason).toBe("host-close");
  });

  it("models selection change events", () => {
    const area: ProtocolEvents["selection:changed"] = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    };

    expect(area.width).toBe(3);
  });

  it("models layer preview change events", () => {
    const preview: ProtocolEvents["layer:previewChange"] = {
      id: 7,
      name: "Layer",
      index: 1,
      width: 12,
      height: 8,
      data: "data:image/png;base64,abc",
    };

    expect(preview.height).toBe(8);
  });

  it("models layer selection change events", () => {
    const selected: ProtocolEvents["layer:selectionChange"] = [
      {
        id: 7,
        index: 1,
        name: "Layer",
        type: 1,
        visible: true,
        clip: false,
        rect: { x: 0, y: 0, width: 12, height: 8 },
        bounds: { left: 0, top: 0, right: 12, bottom: 8 },
      },
    ];
    const empty: ProtocolEvents["layer:selectionChange"] = null;

    expect(selected[0]?.id).toBe(7);
    expect(empty).toBeNull();
  });

  it("keeps plugin-specific error codes out of the server-level catalog", () => {
    expect(ErrorCode.BadRequest).toBe("BAD_REQUEST");
    const codes = ErrorCode as Record<string, string>;
    expect(codes.PaintGone).toBeUndefined();
    expect(codes.ImportFailed).toBeUndefined();
    expect(codes.ValueResolve).toBeUndefined();
    expect(codes.UnsupportedScheme).toBeUndefined();
  });

  it("keeps ProtocolError backward-compatible while accepting structured fields", () => {
    const oldShape: ProtocolError = { code: "INTERNAL", message: "boom" };
    const source: ErrorSource = "jsx";
    const structured: ProtocolError = {
      code: ErrorCode.JsxFailed,
      message: "bad jsx",
      details: { line: 10 },
      retryable: false,
      source,
      requestId: "req-1",
      method: "jsx:execute",
      pluginId: "plug",
    };

    expect(oldShape.message).toBe("boom");
    expect(structured).toMatchObject({
      code: "JSX_FAILED",
      details: { line: 10 },
      source: "jsx",
      requestId: "req-1",
    });
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
