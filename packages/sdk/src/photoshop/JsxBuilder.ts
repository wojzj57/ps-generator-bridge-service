/**
 * Builds ExtendScript fragments from typed values.
 * @internal Used only inside `photoshop/`; not exported from the SDK.
 *
 * Responsibilities: escape string arguments against injection, serialize file
 * paths to `new File(path)`, pass enum strings through verbatim, and serialize
 * numbers, booleans and arrays.
 */
export class JsxBuilder {
  /**
   * Escape a string into a JSX string literal. `JSON.stringify` handles quotes,
   * newlines and Unicode.
   *
   * @example JsxBuilder.string("O'Brien") // -> "\"O'Brien\""
   */
  static string(value: string): string {
    return JSON.stringify(value);
  }

  /**
   * Serialize a path to an ExtendScript `File` constructor.
   *
   * @example JsxBuilder.file("/path/to/file.psd") // -> 'new File("/path/to/file.psd")'
   */
  static file(path: string): string {
    return `new File(${JSON.stringify(path)})`;
  }

  /** Serialize a number, rejecting NaN/Infinity. */
  static number(value: number): string {
    if (!isFinite(value)) {
      throw new Error(`JsxBuilder.number: invalid value ${value}`);
    }
    return String(value);
  }

  /** Serialize a boolean. */
  static boolean(value: boolean): string {
    return value ? "true" : "false";
  }

  /** Pass an enum string through (already in `EnumName.MEMBER` form). */
  static enum_(value: string): string {
    return value;
  }

  /**
   * Serialize a numeric array to a JSX array literal (bounds, crop, etc.).
   *
   * @example JsxBuilder.numberArray([0, 0, 100, 100]) // -> '[0,0,100,100]'
   */
  static numberArray(arr: number[]): string {
    return JSON.stringify(arr);
  }

  /** Serialize a 2-D numeric array (selection boundary points). */
  static regionArray(region: number[][]): string {
    return JSON.stringify(region);
  }

  /**
   * Build a method-call expression from pre-serialized args.
   *
   * @example JsxBuilder.call("app.open", [JsxBuilder.file(path)])
   *          // -> 'app.open(new File("/path/to/file.psd"))'
   */
  static call(path: string, args: string[]): string {
    return `${path}(${args.join(", ")})`;
  }

  /**
   * Build a property assignment statement.
   *
   * @example JsxBuilder.assign("app.activeDocument.activeLayer.name", JsxBuilder.string("New Name"))
   *          // -> 'app.activeDocument.activeLayer.name = "New Name"'
   */
  static assign(path: string, value: string): string {
    return `${path} = ${value}`;
  }
}
