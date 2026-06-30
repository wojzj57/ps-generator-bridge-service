import type { PsJsxRunner } from "./jsx-runner";
import { evalNumber, evalString, evalBool, evalJson } from "./jsx-runner";
import { JsxBuilder } from "./JsxBuilder";
import type { BlendModeValue, AnchorPositionValue, ElementPlacementValue } from "./enums";
import type { PsBounds } from "./types";

/**
 * Wraps an ExtendScript Layer / ArtLayer / LayerSet: the shared Layer
 * properties and methods plus ArtLayer-only members such as `kind`.
 *
 * @remarks
 * `activeLayer` may be an ArtLayer or a LayerSet. Read `typename` before
 * touching ArtLayer-only members:
 * - "ArtLayer" -> a normal layer, `kind` is valid
 * - "LayerSet" -> a group, `kind` is unavailable
 *
 * @example
 * const layer = this.photoshop.activeDocument.activeLayer;
 * const name = await layer.name;
 * await layer.setName("Background");
 * await layer.setVisible(false);
 */
export class PhotoshopLayer {
  constructor(
    private readonly _jsx: PsJsxRunner,
    private readonly _path: string // e.g. "app.activeDocument.activeLayer"
  ) {}

  // --- Layer read-only properties -----------------------------------------

  /** Unique layer id. */
  get id(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.id`);
  }

  /** Layer name. */
  get name(): Promise<string> {
    return evalString(this._jsx, `${this._path}.name`);
  }

  /** Layer visibility. */
  get visible(): Promise<boolean> {
    return evalBool(this._jsx, `${this._path}.visible`);
  }

  /** Layer opacity (0-100). */
  get opacity(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.opacity`);
  }

  /** BlendMode code -> enum-name map (all 27 members, plus newer ones). */
  private static readonly _BLEND_MODE_MAP: Record<number, string> = {
    1: "PASSTHROUGH",
    2: "NORMAL",
    3: "DISSOLVE",
    4: "DARKEN",
    5: "MULTIPLY",
    6: "COLORBURN",
    7: "LINEARBURN",
    8: "LIGHTEN",
    9: "SCREEN",
    10: "COLORDODGE",
    11: "LINEARDODGE",
    12: "OVERLAY",
    13: "SOFTLIGHT",
    14: "HARDLIGHT",
    15: "VIVIDLIGHT",
    16: "LINEARLIGHT",
    17: "PINLIGHT",
    18: "DIFFERENCE",
    19: "EXCLUSION",
    20: "HUE",
    21: "SATURATION",
    22: "COLORBLEND",
    23: "LUMINOSITY",
    26: "HARDMIX",
    27: "SUBTRACT",
    28: "DARKERCOLOR",
    29: "LIGHTERCOLOR",
    30: "DIVIDE",
  };

  /**
   * Blend mode as an enum-name string (e.g. "BlendMode.NORMAL"). ExtendScript
   * yields the numeric code; the static map turns it into a readable name.
   */
  get blendMode(): Promise<string> {
    return evalNumber(this._jsx, `${this._path}.blendMode`).then(
      (code) => PhotoshopLayer._BLEND_MODE_MAP[code] ?? `BlendMode.UNKNOWN_${code}`
    );
  }

  /** Whether the layer is fully locked. */
  get allLocked(): Promise<boolean> {
    return evalBool(this._jsx, `${this._path}.allLocked`);
  }

  /**
   * Layer bounds `[left, top, right, bottom]`.
   *
   * @remarks Units follow `rulerUnits`; values are not pixels unless it is
   * `Units.PIXELS`.
   */
  get bounds(): Promise<PsBounds> {
    const expr = `(function(){ var b = ${this._path}.bounds; return [b[0], b[1], b[2], b[3]]; })()`;
    return evalJson<PsBounds>(this._jsx, expr);
  }

  // --- ArtLayer-only properties -------------------------------------------

  /** LayerKind code -> enum-name map. */
  private static readonly _LAYER_KIND_MAP: Record<number, string> = {
    1: "NORMAL",
    2: "TEXT",
    3: "SOLIDFILL",
    4: "GRADIENTFILL",
    5: "LEVELS",
    6: "CURVES",
    7: "COLORBALANCE",
    8: "HUESATURATION",
    9: "BRIGHTNESSCONTRAST",
    10: "THRESHOLD",
    11: "POSTERIZE",
    12: "CHANNELMIXER",
    13: "GRADIENTMAP",
    14: "INVERSION",
    15: "EXPOSURE",
    16: "PHOTOFILTER",
    17: "SELECTIVECOLOR",
    18: "SMARTOBJECT",
    20: "VIBRANCE",
    21: "VIDEO",
    22: "BLACKANDWHITE",
    23: "LAYER3D",
    26: "COLORLOOKUP",
  };

  /**
   * Layer kind as an enum-name string (e.g. "LayerKind.NORMAL"). ArtLayer only;
   * reading it on a LayerSet throws. Check `typename` first.
   *
   * @remarks GRADIENTFILL=4 and PATTERNFILL=4 collide in Adobe's enums, so a
   * kind of 4 always maps to GRADIENTFILL.
   */
  get kind(): Promise<string> {
    return evalNumber(this._jsx, `${this._path}.kind`).then(
      (code) => PhotoshopLayer._LAYER_KIND_MAP[code] ?? `LayerKind.UNKNOWN_${code}`
    );
  }

  /** Object type name ("ArtLayer" or "LayerSet"). */
  get typename(): Promise<string> {
    return evalString(this._jsx, `${this._path}.typename`);
  }

  // --- Property writes -----------------------------------------------------

  /** Set the layer name. */
  async setName(value: string): Promise<void> {
    await this._jsx.run(JsxBuilder.assign(`${this._path}.name`, JsxBuilder.string(value)));
  }

  /** Set layer visibility. */
  async setVisible(value: boolean): Promise<void> {
    await this._jsx.run(JsxBuilder.assign(`${this._path}.visible`, JsxBuilder.boolean(value)));
  }

  /** Set layer opacity (0-100). */
  async setOpacity(value: number): Promise<void> {
    await this._jsx.run(JsxBuilder.assign(`${this._path}.opacity`, JsxBuilder.number(value)));
  }

  /**
   * Set the blend mode.
   *
   * @example
   * import { BlendMode } from "@ps-generator-bridge/sdk/plugin";
   * await layer.setBlendMode(BlendMode.MULTIPLY);
   */
  async setBlendMode(value: BlendModeValue): Promise<void> {
    await this._jsx.run(JsxBuilder.assign(`${this._path}.blendMode`, JsxBuilder.enum_(value)));
  }

  /** Set whether the layer is fully locked. */
  async setAllLocked(value: boolean): Promise<void> {
    await this._jsx.run(JsxBuilder.assign(`${this._path}.allLocked`, JsxBuilder.boolean(value)));
  }

  // --- Methods -------------------------------------------------------------

  /** Delete this layer. */
  async remove(): Promise<void> {
    await this._jsx.run(`${this._path}.remove()`);
  }

  /** Duplicate this layer (the copy becomes `activeLayer`). */
  async duplicate(): Promise<PhotoshopLayer> {
    await this._jsx.run(`${this._path}.duplicate()`);
    return new PhotoshopLayer(this._jsx, "app.activeDocument.activeLayer");
  }

  /**
   * Move this layer relative to another.
   *
   * @param relativeObjectJsxPath JSX path of the reference layer (e.g.
   *   "app.activeDocument.layers[0]").
   * @param insertionLocation placement enum.
   *
   * @remarks Pass a bare JSX path expression. A `PhotoshopLayers.getByName()`
   * path contains quotes and cannot be used as a reference expression here.
   *
   * @example
   * import { ElementPlacement } from "@ps-generator-bridge/sdk/plugin";
   * await layer.move("app.activeDocument.layers[0]", ElementPlacement.PLACEBEFORE);
   */
  async move(
    relativeObjectJsxPath: string,
    insertionLocation: ElementPlacementValue
  ): Promise<void> {
    await this._jsx.run(
      `${this._path}.move(${relativeObjectJsxPath}, ${JsxBuilder.enum_(insertionLocation)})`
    );
  }

  /** Translate the layer by a pixel delta. */
  async translate(deltaX: number, deltaY: number): Promise<void> {
    await this._jsx.run(
      JsxBuilder.call(`${this._path}.translate`, [
        JsxBuilder.number(deltaX),
        JsxBuilder.number(deltaY),
      ])
    );
  }

  /**
   * Scale the layer.
   *
   * @param horizontal horizontal scale percent (150 = 150%).
   * @param vertical vertical scale percent.
   * @param anchor scaling anchor (optional).
   */
  async resize(horizontal: number, vertical: number, anchor?: AnchorPositionValue): Promise<void> {
    const args: string[] = [JsxBuilder.number(horizontal), JsxBuilder.number(vertical)];
    if (anchor !== undefined) args.push(JsxBuilder.enum_(anchor));
    await this._jsx.run(JsxBuilder.call(`${this._path}.resize`, args));
  }

  /**
   * Rotate the layer.
   *
   * @param angle degrees, clockwise positive.
   * @param anchor rotation anchor (optional).
   */
  async rotate(angle: number, anchor?: AnchorPositionValue): Promise<void> {
    const args: string[] = [JsxBuilder.number(angle)];
    if (anchor !== undefined) args.push(JsxBuilder.enum_(anchor));
    await this._jsx.run(JsxBuilder.call(`${this._path}.rotate`, args));
  }

  /** Move the layer to the end of its stack. */
  async moveToEnd(): Promise<void> {
    await this._jsx.run(`${this._path}.moveToEnd()`);
  }
}
