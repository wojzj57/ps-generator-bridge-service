/**
 * The minimal slice of a JSX runner the Photoshop DOM proxy depends on: run a
 * raw ExtendScript string and resolve its evaluation result. Defined locally
 * (not imported from the generator contract) so the proxy stays transport- and
 * host-agnostic and can be wired to any backend that can evaluate a script.
 *
 * The server's `JsxRunnerApi` satisfies this structurally (`plugin.jsx`), so a
 * plugin passes `this.jsx` straight in. A future client-side backend would
 * supply its own adapter.
 */
export interface PsJsxRunner {
  run<T = unknown>(script: string): Promise<T>;
}

/**
 * Evaluate an ExtendScript expression and JSON-parse its result.
 *
 * `run` returns the evaluation verbatim (a string), so wrapping the expression
 * in `JSON.stringify` on the ExtendScript side is what lets numbers, booleans,
 * strings, arrays and objects all cross the bridge with their real type instead
 * of arriving as untyped strings. `JSON` is available because the default
 * engine is primed with polyfills before any plugin runs.
 */
export function evalJson<T>(jsx: PsJsxRunner, expr: string): Promise<T> {
  return jsx.run<string>(`JSON.stringify(${expr})`).then((s) => JSON.parse(s) as T);
}

/**
 * Read a numeric property, coercing on the ExtendScript side first. Document
 * dimensions are `UnitValue` objects, not plain numbers; `Number(...)` collapses
 * them to their scalar before serialization.
 */
export function evalNumber(jsx: PsJsxRunner, expr: string): Promise<number> {
  return evalJson<number>(jsx, `Number(${expr})`);
}

/** Read a string property (coerced with `String(...)` for safety). */
export function evalString(jsx: PsJsxRunner, expr: string): Promise<string> {
  return evalJson<string>(jsx, `String(${expr})`);
}

/** Read a boolean property (coerced with `Boolean(...)`). */
export function evalBool(jsx: PsJsxRunner, expr: string): Promise<boolean> {
  return evalJson<boolean>(jsx, `Boolean(${expr})`);
}
