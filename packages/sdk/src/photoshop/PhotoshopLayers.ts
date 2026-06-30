import type { PsJsxRunner } from "./jsx-runner";
import { evalNumber } from "./jsx-runner";
import { JsxBuilder } from "./JsxBuilder";
import { PhotoshopLayer } from "./PhotoshopLayer";

/**
 * Wraps an ExtendScript Layers collection (`Document.layers` or
 * `LayerSet.layers`).
 *
 * @example
 * const layers = this.photoshop.activeDocument.layers;
 * const count = await layers.length;
 * const first = layers.at(0);
 * const named = layers.getByName("Background");
 */
export class PhotoshopLayers {
  constructor(
    private readonly _jsx: PsJsxRunner,
    private readonly _path: string // e.g. "app.activeDocument.layers"
  ) {}

  /** Number of layers in the collection. */
  get length(): Promise<number> {
    return evalNumber(this._jsx, `${this._path}.length`);
  }

  /**
   * Access a layer by index. The collection is 0-based, matching JavaScript;
   * `layers[0]` is the top-most layer.
   */
  at(index: number): PhotoshopLayer {
    return new PhotoshopLayer(this._jsx, `${this._path}[${index}]`);
  }

  /**
   * Look up a layer by name (case-sensitive). The returned wrapper works for
   * property reads/writes but its path contains a `getByName(...)` call, so it
   * must not be passed as `PhotoshopLayer.move()`'s reference path.
   */
  getByName(name: string): PhotoshopLayer {
    const escapedName = JsxBuilder.string(name);
    return new PhotoshopLayer(this._jsx, `${this._path}.getByName(${escapedName})`);
  }
}
