import type { PsJsxRunner } from "./jsx-runner";
import { evalString, evalJson } from "./jsx-runner";
import { JsxBuilder } from "./JsxBuilder";
import { PhotoshopDocument } from "./PhotoshopDocument";
import type { PsColor } from "./types";

/**
 * Wraps the ExtendScript global `app` object.
 *
 * @example
 * const version = await this.photoshop.app.version; // "25.0"
 * await this.photoshop.app.open("/path/to/design.psd");
 */
export class PhotoshopApp {
  private readonly _path = "app";

  constructor(private readonly _jsx: PsJsxRunner) {}

  // --- Read-only properties -----------------------------------------------

  /** Photoshop version (e.g. "25.0"). */
  get version(): Promise<string> {
    return evalString(this._jsx, `${this._path}.version`);
  }

  /** Application locale (e.g. "zh_CN"). */
  get locale(): Promise<string> {
    return evalString(this._jsx, `${this._path}.locale`);
  }

  /** Application name (e.g. "Adobe Photoshop"). */
  get name(): Promise<string> {
    return evalString(this._jsx, `${this._path}.name`);
  }

  /** Internal build number. */
  get build(): Promise<string> {
    return evalString(this._jsx, `${this._path}.build`);
  }

  /**
   * Install path (native `fsName`). `app.path` is a File in ExtendScript, so the
   * string comes from `.fsName`.
   */
  get path(): Promise<string> {
    return evalString(this._jsx, `${this._path}.path.fsName`);
  }

  /**
   * Current foreground color (RGB).
   *
   * @remarks The first version returns only the RGB approximation; in CMYK/Lab
   * documents this is Photoshop's converted RGB and may lose precision. The
   * `cmyk` field is reserved and currently always undefined.
   */
  get foregroundColor(): Promise<PsColor> {
    const expr = `(function(){
            var c = ${this._path}.foregroundColor;
            return {
                model: "rgb",
                rgb: { red: c.rgb.red, green: c.rgb.green, blue: c.rgb.blue, hexValue: c.rgb.hexValue }
            };
        })()`;
    return evalJson<PsColor>(this._jsx, expr);
  }

  /** Shortcut for `activeDocument` reached through the `app` path. */
  get activeDocument(): PhotoshopDocument {
    return new PhotoshopDocument(this._jsx, `${this._path}.activeDocument`);
  }

  // --- Methods -------------------------------------------------------------

  /**
   * Open a file and return its Document wrapper. The opened document becomes the
   * active document.
   *
   * @param filePath native or POSIX path.
   *
   * @example
   * const doc = await this.photoshop.app.open("/Users/me/design.psd");
   */
  async open(filePath: string): Promise<PhotoshopDocument> {
    const script = JsxBuilder.call(`${this._path}.open`, [JsxBuilder.file(filePath)]);
    await this._jsx.run(script);
    return new PhotoshopDocument(this._jsx, `${this._path}.activeDocument`);
  }

  /** Emit a beep. */
  async beep(): Promise<void> {
    await this._jsx.run(`${this._path}.beep()`);
  }
}
