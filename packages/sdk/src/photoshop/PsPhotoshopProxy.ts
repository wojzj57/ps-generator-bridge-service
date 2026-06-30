import type { PsJsxRunner } from "./jsx-runner";
import { PhotoshopApp } from "./PhotoshopApp";
import { PhotoshopDocument } from "./PhotoshopDocument";

/**
 * Entry point of the Photoshop DOM proxy. A plugin reaches it through
 * `this.photoshop`:
 *
 * ```ts
 * const version = await this.photoshop.app.version;
 * const name = await this.photoshop.activeDocument.name;
 * ```
 *
 * Transport-agnostic: every property read and method call lowers to an
 * ExtendScript string run through the injected {@link PsJsxRunner}. The proxy
 * holds no PS state of its own.
 *
 * @remarks
 * - `app` maps to the ExtendScript global `app` (Application).
 * - `activeDocument` is a shortcut for `app.activeDocument`.
 * - With no active document, reading any property of `activeDocument` throws.
 */
export class PsPhotoshopProxy {
  /** Application wrapper; its path is fixed to "app". */
  readonly app: PhotoshopApp;

  private readonly _jsx: PsJsxRunner;

  constructor(jsx: PsJsxRunner) {
    this._jsx = jsx;
    this.app = new PhotoshopApp(this._jsx);
  }

  /**
   * The active document (shortcut for `app.activeDocument`). A fresh wrapper is
   * created on each access; wrappers are lightweight and stateless.
   */
  get activeDocument(): PhotoshopDocument {
    return new PhotoshopDocument(this._jsx, "app.activeDocument");
  }
}
