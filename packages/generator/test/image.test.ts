import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { ImageModule } from "../src/modules/image";
import { JsxRunner } from "../src/utils/jsxRunner";
import { LayerModule } from "../src/modules";
import type { Logger } from "../src/utils/logger";
import type { PsBridgeHost } from "../src/plugin";
import { FakeGenerator, fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Build a minimal fake plugin carrying a real `JsxRunner` and a real
 * `LayerModule` over a `FakeGenerator`, plus a `modules.document` with a current
 * document. Enough to drive `ImageModule` without Photoshop or a full
 * `PsBridgeHost`. `getPreview` reaches layer info through `modules.layer`
 * (the capability seam), so a real instance is wired here.
 */
function setup(currentDocument: { id: number } | null = { id: 1 }) {
  const generator = fakeGenerator();
  const jsx = new JsxRunner(generator, silentLogger);
  const plugin = { generator, jsx } as unknown as PsBridgeHost;
  (plugin as { modules: PsBridgeHost["modules"] }).modules = {
    layer: new LayerModule(plugin),
    document: { currentDocument },
  } as unknown as PsBridgeHost["modules"];
  return { generator, plugin, image: new ImageModule(plugin) };
}

/**
 * Construct a raw pixmap buffer Photoshop would stream back: 16-byte header
 * (format/width/height/rowBytes/colorMode/channelCount/bitsPerChannel) followed
 * by `width*height*channelCount` pixels in [A,R,G,B] order.
 */
function makePixmapBuffer(width = 2, height = 2, channelCount = 4): Buffer {
  const pixelBytes = width * height * channelCount;
  const buf = Buffer.alloc(16 + pixelBytes);
  buf.writeUInt8(1, 0); // format
  buf.writeUInt32BE(width, 1);
  buf.writeUInt32BE(height, 5);
  buf.writeUInt32BE(width * channelCount, 9); // rowBytes
  buf.writeUInt8(1, 13); // colorMode
  buf.writeUInt8(channelCount, 14);
  buf.writeUInt8(8, 15); // bitsPerChannel
  for (let i = 0; i < width * height; i++) {
    const o = 16 + i * channelCount;
    buf[o] = 255; // A
    buf[o + 1] = 10; // R
    buf[o + 2] = 20; // G
    buf[o + 3] = 30; // B
  }
  return buf;
}

const BOUNDS = { left: 0, top: 0, right: 2, bottom: 2 };

/** Wire `onSendJSXFile` to emit a bounds + pixmap pair (the happy path). */
function emitHappy(generator: FakeGenerator, bounds = BOUNDS, pixmap = makePixmapBuffer()) {
  generator.onSendJSXFile = (call) => {
    call.emitProgress({ type: "javascript", value: { bounds } });
    call.emitProgress({ type: "pixmap", value: pixmap });
  };
}

function safeLayerInfo(generator: FakeGenerator, value: unknown) {
  generator.onEvaluateJSXString = () => value;
}

/**
 * A *parsed* `PsPixmap` as generator-core's `getDocumentPixmap` returns it (an
 * object, not a raw buffer). `rowBytes` may exceed `width*channelCount` to model
 * Photoshop's per-row padding; 4-channel pixels are `[A,R,G,B]`, 3-channel `[R,G,B]`.
 */
function makeDocPixmap(opts: {
  width: number;
  height: number;
  channelCount: 3 | 4;
  rowBytes?: number;
  bounds?: typeof BOUNDS;
}): any {
  const { width, height, channelCount } = opts;
  const rowBytes = opts.rowBytes ?? width * channelCount;
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * rowBytes + x * channelCount;
      if (channelCount === 4) {
        pixels[p] = 255; // A
        pixels[p + 1] = 10; // R
        pixels[p + 2] = 20; // G
        pixels[p + 3] = 30; // B
      } else {
        pixels[p] = 10; // R
        pixels[p + 1] = 20; // G
        pixels[p + 2] = 30; // B
      }
    }
  }
  return {
    width,
    height,
    channelCount,
    rowBytes,
    pixels,
    bounds: opts.bounds ?? { left: 0, top: 0, right: width, bottom: height },
  };
}

describe("ImageModule.exportImage", () => {
  it("exports a single layer: forwards layerSpec + default include*=true, returns PNG + geometry", async () => {
    const { generator, image } = setup();
    emitHappy(generator);

    const result = await image.exportImage({ layerSpec: 5 });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.bounds).toEqual(BOUNDS);
    // Valid PNG: magic bytes 89 50 4E 47.
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50);
    expect(result.buffer[2]).toBe(0x4e);
    expect(result.buffer[3]).toBe(0x47);

    const call = generator.jsxFileCalls[0]!;
    expect(call.path.endsWith(join("jsx", "Layer", "getLayerPixmap.jsx"))).toBe(true);
    expect(call.params?.layerSpec).toBe(5);
    expect(call.params?.documentId).toBe(1);
    // The fix over generator-core: the four include* flags default to true.
    expect(call.params?.includeAdjustors).toBe(true);
    expect(call.params?.includeChildren).toBe(true);
    expect(call.params?.includeClipBase).toBe(true);
    expect(call.params?.includeClipped).toBe(true);
    // No stray `thread` field (generator-core's bug).
    expect(call.params?.thread).toBeUndefined();
    expect(call.sharedEngineSafe).toBe(true);
  });

  it("uses options.documentId when provided", async () => {
    const { generator, image } = setup();
    emitHappy(generator);

    await image.exportImage({ documentId: 42, layerSpec: 1 });

    expect(generator.jsxFileCalls[0]?.params?.documentId).toBe(42);
  });

  it("throws when no document is open and no documentId given", async () => {
    const { generator, image } = setup(null);
    emitHappy(generator);

    await expect(image.exportImage({ layerSpec: 1 })).rejects.toThrow("No document opened");
  });

  it("surfaces a pixmap-channel failure as a thrown error", async () => {
    const { generator, image } = setup();
    generator.onSendJSXFile = (call) => {
      call.reject("photoshop exploded");
    };

    await expect(image.exportImage({ layerSpec: 1 })).rejects.toThrow("photoshop exploded");
  });
});

describe("ImageModule.exportDocument", () => {
  it("exports the whole document via getDocumentPixmap: returns PNG + geometry", async () => {
    const { generator, image } = setup();
    generator.onGetDocumentPixmap = () => makeDocPixmap({ width: 2, height: 2, channelCount: 4 });

    const result = await image.exportDocument({});

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.bounds).toEqual(BOUNDS);
    // Valid PNG: magic bytes 89 50 4E 47.
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50);
    expect(result.buffer[2]).toBe(0x4e);
    expect(result.buffer[3]).toBe(0x47);
  });

  it("defaults to the current document, else uses options.documentId", async () => {
    const { generator, image } = setup();
    let seenDocId: number | undefined;
    generator.onGetDocumentPixmap = (documentId) => {
      seenDocId = documentId;
      return makeDocPixmap({ width: 1, height: 1, channelCount: 4 });
    };

    await image.exportDocument({});
    expect(seenDocId).toBe(1); // current document from setup()

    await image.exportDocument({ documentId: 77 });
    expect(seenDocId).toBe(77);
  });

  it("handles a 3-channel, row-padded document pixmap without throwing or misaligning", async () => {
    const { generator, image } = setup();
    // 3 channels (no alpha) + rowBytes padded past width*channelCount: the old
    // 4-channel/contiguous-only parser would throw / corrupt; the hardened one copes.
    generator.onGetDocumentPixmap = () =>
      makeDocPixmap({ width: 2, height: 2, channelCount: 3, rowBytes: 8 });

    const result = await image.exportDocument({});

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.buffer[0]).toBe(0x89); // still a valid PNG
  });

  it("throws when no document is open and no documentId given", async () => {
    const { image } = setup(null);
    await expect(image.exportDocument({})).rejects.toThrow("No document opened");
  });
});

describe("ImageModule.getPreview", () => {
  it("single layer: fetches layer info, forces include*=false, scales via getScale", async () => {
    const { generator, image } = setup();
    safeLayerInfo(generator, { rect: { x: 0, y: 0, width: 900, height: 600 } });
    emitHappy(generator);

    await image.getPreview({ layerSpec: 7 });

    // getScale(900,600) = 1 / min(floor(900/300), floor(600/300)) = 1 / min(3,2) = 0.5
    const params = generator.jsxFileCalls[0]?.params as Record<string, unknown>;
    expect(params.scaleX).toBe(0.5);
    expect(params.scaleY).toBe(0.5);
    expect(params.includeClipped).toBe(false);
    expect(params.includeClipBase).toBe(false);
    expect(params.includeAdjustors).toBe(false);
    expect(params.layerSpec).toBe(7);
    // The layer-info lookup used the layerID param inside the safe wrapper.
    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"layerID":7};');
  });

  it("single layer under 300px keeps original scale (1)", async () => {
    const { generator, image } = setup();
    safeLayerInfo(generator, { rect: { x: 0, y: 0, width: 200, height: 150 } });
    emitHappy(generator);

    await image.getPreview({ layerSpec: 1 });

    const params = generator.jsxFileCalls[0]?.params as Record<string, unknown>;
    expect(params.scaleX).toBe(1);
    expect(params.scaleY).toBe(1);
  });

  it("throws on invalid layer info", async () => {
    const { generator, image } = setup();
    safeLayerInfo(generator, undefined);
    emitHappy(generator);

    await expect(image.getPreview({ layerSpec: 9 })).rejects.toThrow(/Layer not found: 9/);
  });
});

describe("ImageModule.parseRawPixels (via exportImage)", () => {
  it("rejects pixmaps with an unsupported channel count (not 3 or 4)", async () => {
    const { generator, image } = setup();
    // 3- and 4-channel are supported; 2-channel is not.
    emitHappy(generator, BOUNDS, makePixmapBuffer(2, 2, 2));

    await expect(image.exportImage({ layerSpec: 1 })).rejects.toThrow(
      /Unsupported channelCount: 2/
    );
  });

  it("encodes a valid PNG whose dimensions match the pixmap", async () => {
    const { generator, image } = setup();
    emitHappy(generator, { left: 1, top: 1, right: 5, bottom: 5 }, makePixmapBuffer(4, 4, 4));

    const result = await image.exportImage({ layerSpec: 1 });

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    // PNG signature.
    expect(result.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  it("times out when the pixmap channel does not emit required progress", async () => {
    vi.useFakeTimers();
    try {
      const { image } = setup();
      const promise = image.exportImage({ layerSpec: 1 });
      const assertion = expect(promise).rejects.toMatchObject({
        code: "PHOTOSHOP_BUSY",
        retryable: true,
        source: "jsx",
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ImageModule @ws wrappers (RFC 0008)", () => {
  /** A fake CosService recording uploads and returning a deterministic URL. */
  function fakeCos(impl?: (data: Uint8Array, name?: string) => Promise<string>) {
    return {
      uploadObject: vi.fn(impl ?? (async (_d: Uint8Array, name?: string) => `https://cos/${name}`)),
      uploadFile: vi.fn(),
    };
  }

  it("exportLayerWs returns a base64 data URI when COS is disabled", async () => {
    const { generator, image } = setup();
    emitHappy(generator);

    const result = await image.exportLayerWs({ layerSpec: 5 });

    expect(result.data.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.bounds).toEqual(BOUNDS);
  });

  it("exportLayerWs uploads to COS and returns the URL, keyed by the layer name", async () => {
    const { generator, plugin, image } = setup();
    const cos = fakeCos();
    (plugin as unknown as { cos: unknown }).cos = cos;
    safeLayerInfo(generator, { name: "Hero" });
    emitHappy(generator);

    const result = await image.exportLayerWs({ layerSpec: 5 });

    expect(result.data).toBe("https://cos/Hero");
    expect(cos.uploadObject).toHaveBeenCalledTimes(1);
    // First arg is the PNG bytes, second the resolved layer name.
    expect(cos.uploadObject.mock.calls[0]![1]).toBe("Hero");
  });

  it("exportLayerWs falls back to layer-{id} when layer info has no name", async () => {
    const { generator, plugin, image } = setup();
    const cos = fakeCos();
    (plugin as unknown as { cos: unknown }).cos = cos;
    safeLayerInfo(generator, {}); // no name
    emitHappy(generator);

    await image.exportLayerWs({ layerSpec: 42 });

    expect(cos.uploadObject.mock.calls[0]![1]).toBe("layer-42");
  });

  it("exportLayerWs throws when the COS upload fails (no base64 fallback)", async () => {
    const { generator, plugin, image } = setup();
    const cos = fakeCos(async () => {
      throw new Error("cos down");
    });
    (plugin as unknown as { cos: unknown }).cos = cos;
    safeLayerInfo(generator, { name: "L" });
    emitHappy(generator);

    await expect(image.exportLayerWs({ layerSpec: 1 })).rejects.toThrow("cos down");
  });

  it("getPreviewWs always returns base64, never uploading even when COS is enabled", async () => {
    const { generator, plugin, image } = setup();
    const cos = fakeCos();
    (plugin as unknown as { cos: unknown }).cos = cos;
    safeLayerInfo(generator, { rect: { x: 0, y: 0, width: 100, height: 100 } });
    emitHappy(generator);

    const result = await image.getPreviewWs({ layerSpec: 7 });

    expect(result.data.startsWith("data:image/png;base64,")).toBe(true);
    expect(cos.uploadObject).not.toHaveBeenCalled();
  });

  it("exportDocumentWs uploads to COS keyed by the current document name", async () => {
    const { generator, plugin, image } = setup({ id: 1, name: "MyDoc" } as { id: number });
    const cos = fakeCos();
    (plugin as unknown as { cos: unknown }).cos = cos;
    generator.onGetDocumentPixmap = () => makeDocPixmap({ width: 2, height: 2, channelCount: 4 });

    const result = await image.exportDocumentWs({});

    expect(result.data).toBe("https://cos/MyDoc");
    expect(cos.uploadObject.mock.calls[0]![1]).toBe("MyDoc");
  });

  it("exportDocumentWs falls back to doc-{id} for a non-current document", async () => {
    const { generator, plugin, image } = setup({ id: 1, name: "MyDoc" } as { id: number });
    const cos = fakeCos();
    (plugin as unknown as { cos: unknown }).cos = cos;
    generator.onGetDocumentPixmap = () => makeDocPixmap({ width: 1, height: 1, channelCount: 4 });

    await image.exportDocumentWs({ documentId: 77 });

    expect(cos.uploadObject.mock.calls[0]![1]).toBe("doc-77");
  });
});

describe("JsxRunner.openJSXFile", () => {
  it("resolves the jsx path, forwards params + sharedEngineSafe, and wires the channel", () => {
    const generator = fakeGenerator();
    const runner = new JsxRunner(generator, silentLogger);

    const channel = runner.openJSXFile("Layer/getLayerPixmap", { foo: 1 }, true);

    expect(generator.jsxFileCalls).toHaveLength(1);
    const call = generator.jsxFileCalls[0]!;
    expect(call.path.endsWith(join("jsx", "Layer", "getLayerPixmap.jsx"))).toBe(true);
    expect(call.params).toEqual({ foo: 1 });
    expect(call.sharedEngineSafe).toBe(true);

    let received: unknown;
    channel.onProgress((m) => {
      received = m;
    });
    call.emitProgress({ type: "pixmap", value: Buffer.from([1, 2]) });
    expect(received).toEqual({ type: "pixmap", value: Buffer.from([1, 2]) });

    let failed: unknown;
    channel.onFail((e) => {
      failed = e;
    });
    call.reject("nope");
    expect(failed).toBe("nope");
  });

  it("defaults sharedEngineSafe to true (pixmap protocol)", () => {
    const generator = fakeGenerator();
    const runner = new JsxRunner(generator, silentLogger);

    runner.openJSXFile("Layer/getLayerPixmap");

    expect(generator.jsxFileCalls[0]?.sharedEngineSafe).toBe(true);
  });
});
