import type { PsJsxRunner } from "./jsx-runner";
import { evalBool, evalJson } from "./jsx-runner";
import { JsxBuilder } from "./JsxBuilder";
import type { SelectionTypeValue } from "./enums";
import type { PsBounds } from "./types";

/**
 * Wraps `Document.selection`.
 *
 * @example
 * const sel = this.photoshop.activeDocument.selection;
 * await sel.selectAll();
 * const bounds = await sel.bounds;
 * await sel.deselect();
 */
export class PhotoshopSelection {
  constructor(
    private readonly _jsx: PsJsxRunner,
    private readonly _path: string // e.g. "app.activeDocument.selection"
  ) {}

  /**
   * Selection bounds `[left, top, right, bottom]`. Throws when there is no
   * selection.
   *
   * @remarks Units follow `rulerUnits`.
   */
  get bounds(): Promise<PsBounds> {
    const expr = `(function(){ var b = ${this._path}.bounds; return [b[0], b[1], b[2], b[3]]; })()`;
    return evalJson<PsBounds>(this._jsx, expr);
  }

  /** Whether the selection is a solid (un-feathered) rectangle. */
  get solid(): Promise<boolean> {
    return evalBool(this._jsx, `${this._path}.solid`);
  }

  // --- Methods -------------------------------------------------------------

  /** Select the whole canvas. */
  async selectAll(): Promise<void> {
    await this._jsx.run(`${this._path}.selectAll()`);
  }

  /** Deselect. */
  async deselect(): Promise<void> {
    await this._jsx.run(`${this._path}.deselect()`);
  }

  /** Invert the selection. */
  async invert(): Promise<void> {
    await this._jsx.run(`${this._path}.invert()`);
  }

  /**
   * Create a selection from a region of points.
   *
   * @param region polygon points, e.g. `[[0,0],[100,0],[100,100],[0,100]]`.
   * @param type selection operation (optional, defaults to replace).
   * @param feather feather radius in pixels (optional).
   * @param antiAlias anti-alias the edges (optional).
   *
   * @example
   * import { SelectionType } from "@ps-generator-bridge/sdk/plugin";
   * await sel.select([[0,0],[100,0],[100,100],[0,100]], SelectionType.REPLACE, 0, true);
   */
  async select(
    region: number[][],
    type?: SelectionTypeValue,
    feather?: number,
    antiAlias?: boolean
  ): Promise<void> {
    const args: string[] = [JsxBuilder.regionArray(region)];
    if (type !== undefined) args.push(JsxBuilder.enum_(type));
    if (feather !== undefined) args.push(JsxBuilder.number(feather));
    if (antiAlias !== undefined) args.push(JsxBuilder.boolean(antiAlias));
    await this._jsx.run(JsxBuilder.call(`${this._path}.select`, args));
  }

  /** Grow the selection by `by` pixels. */
  async expand(by: number): Promise<void> {
    await this._jsx.run(JsxBuilder.call(`${this._path}.expand`, [JsxBuilder.number(by)]));
  }

  /** Shrink the selection by `by` pixels. */
  async contract(by: number): Promise<void> {
    await this._jsx.run(JsxBuilder.call(`${this._path}.contract`, [JsxBuilder.number(by)]));
  }

  /** Feather the selection edge by `by` pixels. */
  async feather(by: number): Promise<void> {
    await this._jsx.run(JsxBuilder.call(`${this._path}.feather`, [JsxBuilder.number(by)]));
  }

  /** Translate the selection boundary (content stays put). */
  async translateBoundary(deltaX: number, deltaY: number): Promise<void> {
    await this._jsx.run(
      JsxBuilder.call(`${this._path}.translateBoundary`, [
        JsxBuilder.number(deltaX),
        JsxBuilder.number(deltaY),
      ])
    );
  }
}
