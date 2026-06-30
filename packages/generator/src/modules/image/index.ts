import sharp from "sharp";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";
import type { PsGenerator } from "../../types/generator";
import type { PsBounds, PsPixmap } from "../../types/ps";
import { Pixmap } from "../../utilis/pixmap";
import { ws } from "@ps-generator-bridge/sdk/plugin";
import { ProtocolMethod, type LayerSpec, type WsImageResult } from "@ps-generator-bridge/sdk";

// `LayerSpec` is owned by the protocol (RFC 0008); re-export it so the
// plugin-facing contract barrel (src/contract.ts) keeps surfacing it from here.
export type { LayerSpec };

/**
 * Single-layer pixmap export + preview, isolated from the buggy
 * `generator.getPixmap` (generator-core's version omits the
 * `includeAdjustors/Children/ClipBase/Clipped` flags and passes a stray
 * `settings.thread` field). `getPixmap` here is a faithful port of
 * LightAi's `LayerManager.getPixmap` (index.ts:364-482): it calls the plugin's
 * own `Layer/getLayerPixmap.jsx` over the progress channel and collects the
 * bounds + pixmap + ICC profile messages Photoshop streams back.
 *
 * Whole-document export is handled separately by generator-core's
 * `getDocumentPixmap` (to be wired up later); this module only deals with
 * explicit layer specs, which is what `Layer/getLayerPixmap.jsx` requires.
 *
 * Encoding (raw RGBA -> PNG) goes through `sharp`, externalized from the bundle
 * and resolved from node_modules at runtime inside Photoshop's Node.
 */
/**
 * The Image module surface a Plugin reaches through `plugin.modules.image`
 * (RFC 0003). `ImageModule implements` this; the SDK re-exports it via
 * src/contract.ts. `settings` is widened to `Record<string, unknown>` so the
 * plugin contract does not drag the generator-core `GetPixmapSettings` namespace
 * into the SDK; `buffer` is `Uint8Array` (not `Buffer`) so the SDK stays
 * Node-free.
 */
export interface ImageModuleApi {
  exportImage(options: {
    documentId?: number;
    layerSpec: LayerSpec;
    settings?: Record<string, unknown>;
  }): Promise<ImageResult>;
  getPreview(options: { documentId?: number; layerSpec: number }): Promise<ImageResult>;
  exportDocument(options: {
    documentId?: number;
    settings?: Record<string, unknown>;
  }): Promise<ImageResult>;
}

export class ImageModule extends BaseModule implements ImageModuleApi {
  constructor(plugin: PsBridgeHost) {
    super("image", plugin);
  }

  /**
   * Export a single layer as a PNG buffer plus its bounds and pixel
   * dimensions. `settings` carries the `GetPixmapSettings` Photoshop accepts;
   * the four `include*` flags default to `true` when unspecified (the fix over
   * generator-core). `layerSpec` is required — the underlying jsx needs an
   * explicit layer id or index range.
   */
  async exportImage(options: {
    documentId?: number;
    layerSpec: LayerSpec;
    settings?: PsGenerator.GetPixmapSettings;
  }): Promise<ImageResult> {
    const { documentId, layerSpec, settings = {} } = options;
    const resolvedDocId = this.resolveDocumentId(documentId);
    const pixmap = await this.getPixmap(resolvedDocId, layerSpec, settings);
    const buffer = await this.encodePng(pixmap);
    return {
      buffer,
      bounds: pixmap.bounds,
      width: pixmap.width,
      height: pixmap.height,
    };
  }

  /**
   * Export a downscaled preview of a single layer. The scale is computed so
   * the longer edge lands near 300px; scaling is done by Photoshop via
   * `scaleX/scaleY`, not by `sharp`. `includeClipped/ClipBase/Adjustors` are
   * forced to `false` to fetch only the body layer's pixels. `layerSpec` is
   * required (a layer id; the layer's `rect` drives the scale).
   */
  async getPreview(options: { documentId?: number; layerSpec: number }): Promise<ImageResult> {
    const { documentId, layerSpec } = options;
    const resolvedDocId = this.resolveDocumentId(documentId);
    const settings: PsGenerator.GetPixmapSettings = {};

    const layer = await this.plugin.modules.layer.getLayerInfoByID(layerSpec);
    if (!layer?.rect) throw new Error("Invalid layer info for preview");
    settings.includeClipped = false;
    settings.includeClipBase = false;
    settings.includeAdjustors = false;
    const scale = getScale(layer.rect.width, layer.rect.height);
    settings.scaleX = scale;
    settings.scaleY = scale;
    const pixmap = await this.getPixmap(resolvedDocId, layerSpec, settings);
    const buffer = await this.encodePng(pixmap);
    return {
      buffer,
      bounds: pixmap.bounds,
      width: pixmap.width,
      height: pixmap.height,
    };
  }

  /**
   * Export the whole document (its current visibility state, flattened) as a PNG
   * buffer plus bounds and pixel dimensions. Unlike `exportImage` (a single layer
   * via the `Layer/getLayerPixmap` jsx protocol), this uses generator-core's
   * built-in `getDocumentPixmap`, which returns an already-parsed `PsPixmap`.
   * `documentId` defaults to the current document; `settings` carries the
   * `GetPixmapSettings` Photoshop accepts (e.g. `scaleX`/`scaleY`).
   */
  async exportDocument(options: {
    documentId?: number;
    settings?: PsGenerator.GetPixmapSettings;
  }): Promise<ImageResult> {
    const documentId = this.resolveDocumentId(options.documentId);
    const pixmap = await this.plugin.generator.getDocumentPixmap(
      documentId,
      options.settings ?? {}
    );
    const buffer = await this.encodePng(pixmap);
    return {
      buffer,
      bounds: pixmap.bounds,
      width: pixmap.width,
      height: pixmap.height,
    };
  }

  /**
   * `@ws` wrapper over {@link exportImage} (RFC 0008). Returns a wire-friendly
   * {@link WsImageResult}: when `plugin.cos` is enabled the PNG is uploaded and
   * `data` is an https URL, otherwise `data` is a base64 data URI. A COS upload
   * failure throws (no base64 fallback) — a configured channel must be used.
   */
  @ws(ProtocolMethod.ImageExportLayer)
  async exportLayerWs(options: {
    documentId?: number;
    layerSpec: LayerSpec;
    settings?: PsGenerator.GetPixmapSettings;
  }): Promise<WsImageResult> {
    const result = await this.exportImage(options);
    const name = this.plugin.cos ? await this.resolveLayerName(options.layerSpec) : undefined;
    return this.toWsResult(result, { upload: true }, name);
  }

  /**
   * `@ws` wrapper over {@link getPreview} (RFC 0008). Always returns base64 —
   * previews are high-frequency, downscaled thumbnails not worth a COS round-trip,
   * so this never uploads even when `plugin.cos` is enabled.
   */
  @ws(ProtocolMethod.ImageGetPreview)
  async getPreviewWs(options: { documentId?: number; layerSpec: number }): Promise<WsImageResult> {
    const result = await this.getPreview(options);
    return this.toWsResult(result, { upload: false });
  }

  /**
   * `@ws` wrapper over {@link exportDocument} (RFC 0008). Uploads to COS when
   * enabled (https URL), else base64; a COS failure throws.
   */
  @ws(ProtocolMethod.ImageExportDocument)
  async exportDocumentWs(options: {
    documentId?: number;
    settings?: PsGenerator.GetPixmapSettings;
  }): Promise<WsImageResult> {
    const result = await this.exportDocument(options);
    const name = this.plugin.cos ? this.resolveDocumentName(options.documentId) : undefined;
    return this.toWsResult(result, { upload: true }, name);
  }

  /**
   * Turn a module-internal {@link ImageResult} (raw PNG `buffer`) into the
   * wire-friendly {@link WsImageResult} (`data` string). With `upload` set and
   * `plugin.cos` enabled, the buffer is uploaded and `data` is the signed URL;
   * otherwise `data` is a `data:image/png;base64,...` URI. Both forms drop
   * straight into an `<img src>`.
   */
  private async toWsResult(
    result: ImageResult,
    opts: { upload: boolean },
    name?: string
  ): Promise<WsImageResult> {
    let data: string;
    if (opts.upload && this.plugin.cos) {
      data = await this.plugin.cos.uploadObject(result.buffer, name);
    } else {
      data = "data:image/png;base64," + Buffer.from(result.buffer).toString("base64");
    }
    return {
      data,
      bounds: result.bounds,
      width: result.width,
      height: result.height,
    };
  }

  /**
   * Resolve a layer's name for the COS object key. A numeric `layerSpec` is
   * looked up via the layer module; an index-range spec has no single name, so it
   * falls back to "layers". Lookup failures degrade to `layer-{id}` rather than
   * failing the export.
   */
  private async resolveLayerName(layerSpec: LayerSpec): Promise<string> {
    if (typeof layerSpec !== "number") return "layers";
    try {
      const layer = await this.plugin.modules.layer.getLayerInfoByID(layerSpec);
      return layer?.name || `layer-${layerSpec}`;
    } catch {
      return `layer-${layerSpec}`;
    }
  }

  /**
   * Resolve a document's name for the COS object key. Uses the current document's
   * name when the target is the current document; otherwise falls back to
   * `doc-{id}` rather than spending a jsx round-trip to name an off-screen doc.
   */
  private resolveDocumentName(documentId?: number): string {
    const resolvedId = this.resolveDocumentId(documentId);
    const current = this.plugin.modules.document.currentDocument;
    if (current && current.id === resolvedId && current.name) return current.name;
    return `doc-${resolvedId}`;
  }

  /**
   * Faithful port of LightAi `LayerManager.getPixmap` (index.ts:364-482).
   * Builds the params (dropping generator-core's stray `settings.thread` and
   * defaulting the four `include*` flags to `true`), opens the pixmap jsx over
   * the progress channel, and resolves three native promises as the
   * bounds/pixmap/iccProfile messages arrive. Once all expected messages are
   * in, signals the channel to settle and constructs a `Pixmap`.
   */
  private async getPixmap(
    documentId: number,
    layerSpec: LayerSpec,
    settings: PsGenerator.GetPixmapSettings
  ): Promise<Pixmap> {
    const params: Record<string, unknown> = {
      documentId,
      layerSpec,
      compId: settings.compId,
      compIndex: settings.compIndex,
      inputRect: settings.inputRect,
      outputRect: settings.outputRect,
      scaleX: settings.scaleX || 1,
      scaleY: settings.scaleY || 1,
      bounds: true,
      boundsOnly: settings.boundsOnly,
      useJPGEncoding: settings.useJPGEncoding || "",
      useSmartScaling: settings.useSmartScaling || false,
      includeAncestorMasks: settings.includeAncestorMasks || false,
      convertToWorkingRGBProfile: settings.convertToWorkingRGBProfile || false,
      useICCProfile: settings.useICCProfile || "",
      getICCProfileData: settings.getICCProfileData || false,
      allowDither: settings.allowDither || false,
      useColorSettingsDither: settings.useColorSettingsDither || false,
      interpolationType: settings.interpolationType,
      forceSmartPSDPixelScaling: settings.forceSmartPSDPixelScaling || false,
      clipToDocumentBounds: settings.clipToDocumentBounds || false,
      maxDimension: settings.maxDimension || 10000,
      clipBounds: settings.clipBounds,
      includeAdjustors: settings.includeAdjustors !== undefined ? settings.includeAdjustors : true,
      includeChildren: settings.includeChildren !== undefined ? settings.includeChildren : true,
      includeClipBase: settings.includeClipBase !== undefined ? settings.includeClipBase : true,
      includeClipped: settings.includeClipped !== undefined ? settings.includeClipped : true,
    };

    const channel = this.plugin.jsx.openJSXFile("Layer/getLayerPixmap", params, true);

    let jsResolve!: (v: { bounds: PsBounds } | undefined) => void;
    let jsReject!: (e: unknown) => void;
    const jsPromise = new Promise<{ bounds: PsBounds } | undefined>((res, rej) => {
      jsResolve = res;
      jsReject = rej;
    });

    let pixmapResolve!: (v: Buffer | undefined) => void;
    let pixmapReject!: (e: unknown) => void;
    const pixmapPromise = new Promise<Buffer | undefined>((res, rej) => {
      pixmapResolve = res;
      pixmapReject = rej;
    });

    let profileResolve!: (v: Buffer | undefined) => void;
    let profileReject!: (e: unknown) => void;
    const profilePromise = new Promise<Buffer | undefined>((res, rej) => {
      profileResolve = res;
      profileReject = rej;
    });

    channel.onProgress((message) => {
      if (message.type === "javascript") {
        // Two javascript responses come back: the JSX result and a bounds
        // object. We only care about the bounds one.
        if (
          message.value instanceof Object &&
          Object.prototype.hasOwnProperty.call(message.value, "bounds")
        ) {
          jsResolve(message.value as { bounds: PsBounds });
        }
      } else if (message.type === "pixmap") {
        pixmapResolve(message.value as Buffer);
      } else if (message.type === "iccProfile") {
        profileResolve(message.value as Buffer);
      }
    });

    channel.onFail((err) => {
      jsReject(err);
      pixmapReject(err);
      profileReject(err);
    });

    // Resolve early when we aren't expecting a pixmap / ICC profile.
    if (params.boundsOnly) {
      pixmapResolve(undefined);
      profileResolve(undefined);
    }
    if (!params.getICCProfileData) {
      profileResolve(undefined);
    }

    const [js, iccProfileBuffer, pixmapBuffer] = await Promise.all([
      jsPromise,
      profilePromise,
      pixmapPromise,
    ]);
    channel.resolve();

    if (params.boundsOnly && js && js.bounds) {
      // boundsOnly callers want the bounds object, not a pixmap. Current
      // callers (exportImage/getPreview) never set boundsOnly, so this branch
      // is retained for fidelity with the ported source.
      return js as unknown as Pixmap;
    }
    if (js && js.bounds && pixmapBuffer) {
      const pixmap = new Pixmap(pixmapBuffer);
      pixmap.bounds = js.bounds;
      if (iccProfileBuffer) {
        pixmap.iccProfile = iccProfileBuffer;
      }
      return pixmap;
    }
    throw new Error(
      `Unexpected response from PS in getLayerPixmap: js=${JSON.stringify(js)}, ` +
        `pixmap=${pixmapBuffer ? "truthy" : "falsy"}, ` +
        `iccExpected=${params.getICCProfileData}`
    );
  }

  /**
   * Resolve the document id: explicit override, else the document module's
   * current document, else fail loud (matches LightAi's "No document opened").
   */
  private resolveDocumentId(documentId?: number): number {
    if (documentId !== undefined) return documentId;
    const current = this.plugin.modules.document.currentDocument;
    if (current) return current.id;
    throw new Error("No document opened");
  }

  /**
   * Convert a pixmap's raw pixels into a tightly-packed RGBA buffer. Handles both
   * the single-layer protocol (`getLayerPixmap`: 4-channel, no row padding) and
   * generator-core's `getDocumentPixmap` (which may return 3-channel pixmaps and
   * rows padded to `rowBytes`). 4-channel is Photoshop's `[A,R,G,B]` layout;
   * 3-channel is `[R,G,B]` and gets an opaque alpha. Rows are walked by
   * `rowBytes` so any per-row padding is skipped rather than misaligning the image.
   */
  private parseRawPixels(pixmap: PsPixmap): Buffer {
    const { width, height, channelCount, pixels } = pixmap;
    if (channelCount !== 3 && channelCount !== 4) {
      throw new Error(`Unsupported channelCount: ${channelCount}`);
    }
    // Trust rowBytes only when it can hold a full row; else assume no padding.
    const rowBytes =
      pixmap.rowBytes && pixmap.rowBytes >= width * channelCount
        ? pixmap.rowBytes
        : width * channelCount;
    const output = Buffer.allocUnsafe(width * height * 4);
    let o = 0;
    for (let y = 0; y < height; y++) {
      let p = y * rowBytes;
      for (let x = 0; x < width; x++) {
        if (channelCount === 4) {
          // [A,R,G,B] -> [R,G,B,A]
          output[o++] = pixels.readUInt8(p + 1); // R
          output[o++] = pixels.readUInt8(p + 2); // G
          output[o++] = pixels.readUInt8(p + 3); // B
          output[o++] = pixels.readUInt8(p); // A
        } else {
          // [R,G,B] -> [R,G,B,255]
          output[o++] = pixels.readUInt8(p); // R
          output[o++] = pixels.readUInt8(p + 1); // G
          output[o++] = pixels.readUInt8(p + 2); // B
          output[o++] = 255; // opaque
        }
        p += channelCount;
      }
    }
    return output;
  }

  private async encodePng(pixmap: PsPixmap): Promise<Buffer> {
    const rgba = this.parseRawPixels(pixmap);
    return sharp(rgba, {
      raw: {
        width: pixmap.width,
        height: pixmap.height,
        channels: 4,
      },
    })
      .ensureAlpha()
      .png()
      .toBuffer();
  }
}

/**
 * Result of an image export / preview: PNG bytes plus geometry metadata. The
 * bytes are typed as `Uint8Array` (the implementation returns a `Buffer`, which
 * is a `Uint8Array` subtype) so this type can cross into the Node-free SDK
 * contract unchanged.
 */
export interface ImageResult {
  buffer: Uint8Array;
  bounds: PsBounds;
  width: number;
  height: number;
}

/**
 * Scale so the longer edge lands near 300px; smaller images keep their size.
 * Port of LightAi's `getScale` (index.ts:748-752).
 */
const getScale = (width: number, height: number): number => {
  const xScale = Math.floor(width / 300) || 1;
  const yScale = Math.floor(height / 300) || 1;
  return 1 / Math.min(xScale, yScale);
};
