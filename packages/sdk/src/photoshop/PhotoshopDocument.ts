import type { PsJsxRunner } from "./jsx-runner";
import { evalNumber, evalString, evalBool, evalJson } from "./jsx-runner";
import { JsxBuilder } from "./JsxBuilder";
import { PhotoshopLayer } from "./PhotoshopLayer";
import { PhotoshopLayers } from "./PhotoshopLayers";
import { PhotoshopSelection } from "./PhotoshopSelection";
import type { SaveOptionsValue } from "./enums";
import type { PsBounds } from "./types";

/**
 * Wraps an ExtendScript Document.
 *
 * @example
 * const doc = this.photoshop.activeDocument;
 * const name = await doc.name;
 * const [width, height] = await Promise.all([doc.width, doc.height]);
 * await doc.save();
 */
export class PhotoshopDocument {
  constructor(
    private readonly _jsx: PsJsxRunner,
    private readonly _path: string // e.g. "app.activeDocument"
  ) {}

  // --- Read-only properties -----------------------------------------------

  /** Document name (file name, without directory). */
  get name(): Promise<string> {
    return evalString(this._jsx, `${this._path}.name`);
  }

  /** Unique document id. */
  get id(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.id`);
  }

  /**
   * Document width.
   *
   * @remarks The unit follows Photoshop's current `app.preferences.rulerUnits`.
   * For guaranteed pixels, set `rulerUnits` to `Units.PIXELS` first (e.g. via
   * `this.jsx.run(...)`).
   */
  get width(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.width`);
  }

  /**
   * Document height.
   *
   * @remarks The unit follows `rulerUnits` (see {@link width}).
   */
  get height(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.height`);
  }

  /** Document resolution (PPI). */
  get resolution(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.resolution`);
  }

  /** Document color mode as an enum-name string (e.g. "DocumentMode.RGB"). */
  get mode(): Promise<string> {
    const expr = `(function(){
            var m = ${this._path}.mode;
            if (m === DocumentMode.RGB) return "DocumentMode.RGB";
            if (m === DocumentMode.CMYK) return "DocumentMode.CMYK";
            if (m === DocumentMode.GRAYSCALE) return "DocumentMode.GRAYSCALE";
            if (m === DocumentMode.LAB) return "DocumentMode.LAB";
            if (m === DocumentMode.BITMAP) return "DocumentMode.BITMAP";
            if (m === DocumentMode.INDEXEDCOLOR) return "DocumentMode.INDEXEDCOLOR";
            if (m === DocumentMode.MULTICHANNEL) return "DocumentMode.MULTICHANNEL";
            if (m === DocumentMode.DUOTONE) return "DocumentMode.DUOTONE";
            return String(m);
        })()`;
    return evalJson<string>(this._jsx, expr);
  }

  /** Whether the document is saved since its last change. */
  get saved(): Promise<boolean> {
    return evalBool(this._jsx, `${this._path}.saved`);
  }

  /**
   * Full document path (native `fsName`). For an unsaved document this may
   * return a temporary path or throw.
   */
  get fullName(): Promise<string> {
    return evalString(this._jsx, `${this._path}.fullName.fsName`);
  }

  /** Directory containing the document (native `fsName`). */
  get path(): Promise<string> {
    return evalString(this._jsx, `${this._path}.path.fsName`);
  }

  // --- Child navigation (synchronous; no request) -------------------------

  /** The active layer. */
  get activeLayer(): PhotoshopLayer {
    return new PhotoshopLayer(this._jsx, `${this._path}.activeLayer`);
  }

  /** The Layers collection (ArtLayers + LayerSets). */
  get layers(): PhotoshopLayers {
    return new PhotoshopLayers(this._jsx, `${this._path}.layers`);
  }

  /** The selection. */
  get selection(): PhotoshopSelection {
    return new PhotoshopSelection(this._jsx, `${this._path}.selection`);
  }

  // --- Methods -------------------------------------------------------------

  /** Save the document in its current format. */
  async save(): Promise<void> {
    await this._jsx.run(`${this._path}.save()`);
  }

  /**
   * Close the document.
   *
   * @param saving save behavior before closing (defaults to not saving).
   *
   * @example
   * import { SaveOptions } from "@ps-generator-bridge/sdk/plugin";
   * await doc.close(SaveOptions.DONOTSAVECHANGES);
   */
  async close(saving: SaveOptionsValue = "SaveOptions.DONOTSAVECHANGES"): Promise<void> {
    await this._jsx.run(JsxBuilder.call(`${this._path}.close`, [JsxBuilder.enum_(saving)]));
  }

  /**
   * Save to a path. Mirrors ExtendScript
   * `saveAs(saveIn, options?, asCopy?, extensionType?)`; only `saveIn` and
   * `asCopy` are exposed, `options` is undefined and `extensionType` is left to
   * the Photoshop default.
   *
   * @param saveIn destination path.
   * @param asCopy save as a copy (does not change the document's saved state).
   */
  async saveAs(saveIn: string, asCopy?: boolean): Promise<void> {
    const script = `${this._path}.saveAs(${JsxBuilder.file(saveIn)}${
      asCopy !== undefined ? `, undefined, ${JsxBuilder.boolean(asCopy)}` : ""
    })`;
    await this._jsx.run(script);
  }

  /** Flatten all layers into a single background layer. */
  async flatten(): Promise<void> {
    await this._jsx.run(`${this._path}.flatten()`);
  }

  /** Merge all visible layers. */
  async mergeVisibleLayers(): Promise<void> {
    await this._jsx.run(`${this._path}.mergeVisibleLayers()`);
  }

  /** Rasterize all layers. */
  async rasterizeAllLayers(): Promise<void> {
    await this._jsx.run(`${this._path}.rasterizeAllLayers()`);
  }

  /**
   * Duplicate the document.
   *
   * @param name optional name for the copy.
   * @returns the duplicated document.
   *
   * @remarks Assumes `duplicate()` makes the copy the active document, so the
   * result points at `app.activeDocument`.
   */
  async duplicate(name?: string): Promise<PhotoshopDocument> {
    const args = name !== undefined ? [JsxBuilder.string(name)] : [];
    await this._jsx.run(JsxBuilder.call(`${this._path}.duplicate`, args));
    return new PhotoshopDocument(this._jsx, "app.activeDocument");
  }

  /**
   * Resize the canvas.
   *
   * @param width new width in pixels.
   * @param height new height in pixels.
   * @param anchor anchor position (optional, defaults to center).
   *
   * @example
   * import { AnchorPosition } from "@ps-generator-bridge/sdk/plugin";
   * await doc.resizeCanvas(1920, 1080, AnchorPosition.MIDDLECENTER);
   */
  async resizeCanvas(width: number, height: number, anchor?: string): Promise<void> {
    const args: string[] = [JsxBuilder.number(width), JsxBuilder.number(height)];
    if (anchor !== undefined) args.push(JsxBuilder.enum_(anchor));
    await this._jsx.run(JsxBuilder.call(`${this._path}.resizeCanvas`, args));
  }

  /**
   * Resize the image.
   *
   * @param width new width in pixels (optional).
   * @param height new height in pixels (optional).
   * @param resolution new resolution in PPI (optional).
   */
  async resizeImage(width?: number, height?: number, resolution?: number): Promise<void> {
    const args: string[] = [
      width !== undefined ? JsxBuilder.number(width) : "undefined",
      height !== undefined ? JsxBuilder.number(height) : "undefined",
      resolution !== undefined ? JsxBuilder.number(resolution) : "undefined",
    ];
    await this._jsx.run(JsxBuilder.call(`${this._path}.resizeImage`, args));
  }

  /** Rotate the canvas by `angle` degrees. */
  async rotateCanvas(angle: number): Promise<void> {
    await this._jsx.run(JsxBuilder.call(`${this._path}.rotateCanvas`, [JsxBuilder.number(angle)]));
  }

  /**
   * Crop the document to `bounds` `[left, top, right, bottom]` (pixels).
   *
   * @remarks Only `bounds` is exposed; ExtendScript `crop()` also takes angle,
   * width and height — reach those via `this.jsx.run(...)` if needed.
   */
  async crop(bounds: PsBounds): Promise<void> {
    const script = `${this._path}.crop(${JsxBuilder.numberArray(Array.from(bounds))})`;
    await this._jsx.run(script);
  }
}
