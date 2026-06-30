import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { PsGenerator } from "../types/generator";
import type { Logger } from "./logger";
import { bridgeError, BridgeError } from "../errors";

// Prefix a jsx return value uses to signal failure (LightAi BaseManager
// convention). `JsxRunner.run` / `execute` turn such a value into a thrown
// Error.
const ERROR_PREFIX = "Error:";
const DEFAULT_JSX_TIMEOUT_MS = 100_000;

/**
 * A single progress notification emitted by Photoshop while a jsx file
 * evaluates via `_sendJSXFile`. `type` is `"javascript"` (an evaluation result
 * — e.g. a bounds object), `"pixmap"` (a raw pixmap buffer), or `"iccProfile"`
 * (a raw ICC profile buffer).
 */
export interface JsxProgressMessage {
  type: "javascript" | "pixmap" | "iccProfile" | string;
  value: unknown;
}

/**
 * Typed handle to an in-flight `_sendJSXFile` evaluation. `onProgress`/`onFail`
 * subscribe to the underlying deferred's streams; `resolve`/`reject` let the
 * caller signal completion (required — the deferred won't settle on its own).
 * Isolates the `_sendJSXFile` touchpoint inside the JSX seam so callers like
 * `ImageModule.getPixmap` never reach generator-core's transport directly.
 */
export interface JsxChannel {
  onProgress(fn: (message: JsxProgressMessage) => void): void;
  onFail(fn: (err: unknown) => void): void;
  resolve(): void;
  reject(err?: unknown): void;
}

/**
 * The slice of JsxRunner a Plugin reaches through `plugin.jsx` (RFC 0003 /
 * RFC 0005). The concrete JsxRunner `implements` this (and `forPlugin` returns a
 * scoped view that also implements it), so the plugin contract can never drift
 * from the implementation; the SDK re-exports it (via src/contract.ts) as the
 * type of `PluginHost.jsx`. Excludes lifecycle (`init`) and the low-level pixmap
 * channel (`openJSXFile`) — plugins only run jsx by name (or raw string).
 *
 * `execute` resolves against *this handle's own* jsx scope: the built-in `jsx/`
 * tree for the host's root runner, or the plugin's own `jsx/` dir for the scoped
 * view `plugin.jsx` returns. `executeBuiltin` always targets the built-in tree,
 * so a plugin can reach a host domain (e.g. `Document/getDocumentInfo`) without
 * knowing its own id or dir. `run` takes a raw script and is scope-independent.
 */
export interface JsxRunnerApi {
  execute<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T>;
  executeBuiltin<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T>;
  run<T = unknown>(script: string): Promise<T>;
}

export interface JsxRunOptions {
  timeoutMs?: number;
}

type SafeJsxResult<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error: {
        message?: unknown;
        details?: Record<string, unknown>;
        retryable?: boolean;
      };
    };

/**
 * Runs packaged jsx by name (ADR 0008). Resolves a name like
 * `Document/getDocumentInfo` to its physical path under the bundle's `jsx/`
 * directory, wraps it in the safe JSX try/catch envelope, hands that script to
 * `evaluateJSXString`, and normalizes the result.
 *
 * Returns `message.value` verbatim — it does NOT `JSON.parse` for the caller;
 * the `T` type parameter is a labelling convenience only. A string value
 * starting with `"Error:"` becomes a thrown `Error` carrying the remainder.
 *
 * jsx text caching is handled by generator-core's `_sendJSXCache`, so this seam
 * adds none of its own. `__dirname` is `dist` for all bundled code, so
 * `polyfillsDir` defaults to `dist/jsx/polyfills`.
 *
 * ExtendScript's default engine persists globals across evaluations, so the
 * polyfills injected once in `init()` remain available to every later
 * `execute` (and to `run` when it uses the default engine). The default engine
 * is the only one primed — `sharedEngineSafe` callers use a separate engine
 * that does NOT receive the polyfills.
 */
export class JsxRunner implements JsxRunnerApi {
  private readonly jsxDir = join(__dirname, "..", "jsx");
  private polyfillsCache = "";

  constructor(
    private readonly generator: PsGenerator,
    private readonly logger: Logger,
    private readonly polyfillsDir = join(__dirname, "..", "jsx", "polyfills")
  ) {}

  /**
   * A jsx runner scoped to a plugin's own `jsx/` dir (RFC 0005). The returned
   * handle's `execute` resolves under `dir`, while `executeBuiltin` still targets
   * the built-in tree; `run` is unchanged. The scope is the *only* per-plugin
   * state — there is no shared mutable registry; the host builds one of these per
   * plugin in `hostFor` and injects it as `plugin.jsx`.
   */
  forPlugin(dir: string): JsxRunnerApi {
    return new ScopedJsx(this, dir);
  }

  /**
   * Resolve a jsx name to an absolute `.jsx` path under `baseDir`. The name may
   * carry domain subdirs (e.g. `Document/getDocumentInfo`). No escape guard: jsx
   * names come from trusted in-process code (a module or a plugin's own source),
   * which already runs arbitrary JS, so a guard would add no boundary.
   */
  private resolvePath(baseDir: string, name: string): string {
    return join(baseDir, `${name}.jsx`);
  }

  /**
   * Prime the default ExtendScript engine with ES polyfills. Reads every
   * `*.js` file under `polyfillsDir` (recursively, sorted by relative path for
   * deterministic concatenation order), concatenates them into `polyfillsCache`,
   * and evaluates the bundle once. Must be awaited before any `execute` call
   * that depends on the polyfills; `PsBridgeHost.onInit` does this before
   * `server.listen`.
   *
   * Missing dir -> throw (packaging bug). Empty dir -> no-op. Injection
   * returning `"Error:…"` or rejecting -> throw, so a broken polyfill surfaces
   * at startup rather than as a runtime `find is not a function`.
   */
  async init(): Promise<void> {
    const files = await this.collectPolyfillFiles();
    if (files.length === 0) {
      this.logger.debug("polyfills dir empty, skipping injection");
      this.polyfillsCache = "";
      return;
    }
    const parts = await Promise.all(files.map((file) => readFile(file, "utf8")));
    this.polyfillsCache = parts.join("\n");
    const value = await this.generator.evaluateJSXString(this.polyfillsCache);
    if (typeof value === "string" && value.startsWith(ERROR_PREFIX)) {
      throw new Error(value.slice(ERROR_PREFIX.length));
    }
    this.logger.debug(`polyfills injected: ${files.length} files`);
  }

  /**
   * Run the jsx registered under `name` in the built-in `jsx/` tree (domain
   * subdirs included, e.g. `Document/getDocumentInfo`). `params` are inlined into
   * the script; `sharedEngineSafe` opts into Photoshop's shared script engine.
   * The root runner's own scope *is* the built-in tree, so `execute` and
   * `executeBuiltin` coincide here; a plugin's scoped view (see `forPlugin`)
   * splits them apart.
   */
  async execute<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T> {
    void sharedEngineSafe;
    return this.executeSafeIn<T>(this.jsxDir, name, params);
  }

  async executeSafe<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    options: JsxRunOptions = {}
  ): Promise<T> {
    return this.executeSafeIn<T>(this.jsxDir, name, params, options);
  }

  /**
   * Alias of `execute` on the root runner — always the built-in tree. Present so
   * the root satisfies `JsxRunnerApi` alongside the scoped view; the scoped view
   * overrides `execute` (plugin dir) while delegating `executeBuiltin` here.
   */
  async executeBuiltin<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T> {
    return this.execute<T>(name, params, sharedEngineSafe);
  }

  /**
   * Run the jsx under `name` resolved against `baseDir`. The seam through which
   * both the root runner (built-in tree) and the scoped view (a plugin's dir)
   * reach Photoshop; keeps path resolution + result normalization in one place.
   *
   * @internal Server-internal — not on `JsxRunnerApi`, not reachable by plugins.
   * Public only so the sibling `ScopedJsx` can delegate to it.
   */
  async executeSafeIn<T = unknown>(
    baseDir: string,
    name: string,
    params?: Record<string, unknown>,
    options: JsxRunOptions = {}
  ): Promise<T> {
    const path = this.resolvePath(baseDir, name);
    const body = await this.readJsxSource(path);
    const script = this.wrapSafeScript(body, params);
    const value = await this.withTimeout(
      this.generator.evaluateJSXString(script),
      options.timeoutMs,
      { name, kind: "file" }
    );
    return this.parseSafeResult<T>(value, { name, kind: "file" });
  }

  /**
   * Evaluate an arbitrary jsx string in the default ExtendScript engine (the
   * same engine `init()` primed with polyfills). No `sharedEngineSafe` opt-out:
   * polyfills live only in the default engine, so a shared-engine variant would
   * be silently un-polyfilled. Return value follows the same convention as
   * `run` — verbatim, with `"Error:"`-prefixed strings turned into thrown
   * Errors.
   */
  async run<T = unknown>(script: string): Promise<T> {
    const value = await this.generator.evaluateJSXString(script);
    return this.normalizeJsxResult<T>(value);
  }

  async runSafe<T = unknown>(script: string, options: JsxRunOptions = {}): Promise<T> {
    const value = await this.withTimeout(
      this.generator.evaluateJSXString(this.wrapSafeScript(script)),
      options.timeoutMs,
      { kind: "string" }
    );
    return this.parseSafeResult<T>(value, { kind: "string" });
  }

  /**
   * Open a built-in packaged jsx file via the low-level `_sendJSXFile` channel
   * and return a typed handle to its in-flight evaluation. A root-runner-only
   * seam (not on `JsxRunnerApi`): the only caller is `ImageModule.getPixmap`.
   * Plugins reach pixmaps through `plugin.modules.image`, not this channel.
   *
   * Unlike `run` (which
   * awaits a single resolved value), this exposes the raw progress stream so
   * the caller can collect the multi-message responses Photoshop emits for
   * pixmap-producing scripts (bounds + pixmap + optional ICC profile). The
   * caller owns completion: it must call `channel.resolve()` once it has
   * received every message it expected, or `channel.reject(err)` on failure.
   *
   * `sharedEngineSafe` defaults to `true` to match the pixmap protocol
   * (generator-core's `getPixmap` / `getDocumentPixmap` both use the shared
   * engine).
   */
  openJSXFile(name: string, params?: Record<string, unknown>, sharedEngineSafe = true): JsxChannel {
    const path = this.resolvePath(this.jsxDir, name);
    const deferred = this.generator._sendJSXFile(path, params, sharedEngineSafe);
    return {
      onProgress: (fn) => {
        deferred.promise.progress(fn as (message: { type: string; value: unknown }) => void);
      },
      onFail: (fn) => {
        deferred.promise.fail(fn);
      },
      resolve: () => {
        deferred.resolve();
      },
      reject: (err) => {
        deferred.reject(err);
      },
    };
  }

  /**
   * Shared result normalization for `run` and `execute`: a string starting with
   * `"Error:"` becomes a thrown `Error` carrying the remainder; everything else
   * is returned verbatim (no `JSON.parse` — `T` is a labelling convenience).
   */
  private normalizeJsxResult<T>(value: unknown): T {
    if (typeof value === "string" && value.startsWith(ERROR_PREFIX)) {
      throw bridgeError.jsxFailed(value.slice(ERROR_PREFIX.length));
    }
    return value as T;
  }

  private async readJsxSource(path: string): Promise<string> {
    try {
      return String(await readFile(path, "utf8"));
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      const sourceSegment = `${sep}src${sep}jsx${sep}`;
      if (code === "ENOENT" && path.includes(sourceSegment)) {
        return String(await readFile(path.replace(sourceSegment, `${sep}jsx${sep}`), "utf8"));
      }
      throw error;
    }
  }

  private wrapSafeScript(script: string, params?: Record<string, unknown>): string {
    const paramsScript = `var params = ${JSON.stringify(params ?? {})};`;
    return `
try {
  ${paramsScript}
  ${script}
} catch (err) {
  JSON.stringify({
    ok: false,
    error: {
      code: "JSX_FAILED",
      message: String((err && err.message) || err),
      details: {
        name: err && err.name,
        line: err && err.line,
        fileName: err && err.fileName
      }
    }
  });
}`;
  }

  private parseSafeResult<T>(value: unknown, context: Record<string, unknown>): T {
    if (typeof value === "string" && value.startsWith(ERROR_PREFIX)) {
      throw bridgeError.jsxFailed(value.slice(ERROR_PREFIX.length), context);
    }
    if (typeof value !== "string") return value as T;
    let parsed: SafeJsxResult<T>;
    try {
      parsed = JSON.parse(value) as SafeJsxResult<T>;
    } catch {
      return value as T;
    }
    if (parsed && parsed.ok === true) return parsed.result;
    if (parsed && parsed.ok === false) {
      const message =
        typeof parsed.error?.message === "string" ? parsed.error.message : "JSX execution failed";
      throw bridgeError.jsxFailed(message, { ...context, ...parsed.error?.details });
    }
    return value as T;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs = DEFAULT_JSX_TIMEOUT_MS,
    context: Record<string, unknown>
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(bridgeError.photoshopBusy(`JSX timed out after ${timeoutMs}ms`, context));
      }, timeoutMs);
    });
    return Promise.race([promise, timeout])
      .catch((error) => {
        if (error instanceof BridgeError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw bridgeError.jsxFailed(message, context);
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  }

  /**
   * Recursively list `*.js` files under `polyfillsDir`, sorted by relative path
   * (POSIX-normalized) so concatenation order is stable across platforms and
   * polyfills that depend on each other load in a fixed sequence. Throws if the
   * directory itself is missing.
   */
  private async collectPolyfillFiles(): Promise<string[]> {
    const discovered: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error: unknown) {
        // ENOENT on the root dir is a packaging bug -> fail loud. Subtree
        // read errors (permissions, etc.) also surface here.
        if (dir === this.polyfillsDir) {
          throw new Error(`polyfills dir not found: ${this.polyfillsDir}`);
        }
        throw error;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          discovered.push(full);
        }
      }
    };
    await walk(this.polyfillsDir);
    return discovered.sort((a, b) => {
      const ra = relative(this.polyfillsDir, a).split(sep).join("/");
      const rb = relative(this.polyfillsDir, b).split(sep).join("/");
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
  }
}

/**
 * A plugin's view of the JsxRunner, scoped to its own `jsx/` dir (RFC 0005).
 * Created by `JsxRunner.forPlugin` and injected as `plugin.jsx`. Stateless apart
 * from `baseDir`: it delegates every call back to the single root runner (which
 * owns the generator handle and the once-primed polyfills), so plugin jsx runs
 * in the same default engine and sees the same polyfills as the built-in tree.
 *
 * `execute` resolves under the plugin's `baseDir`; `executeBuiltin` reaches the
 * built-in tree via the root's `execute`; `run` is forwarded verbatim.
 */
class ScopedJsx implements JsxRunnerApi {
  constructor(
    private readonly root: JsxRunner,
    private readonly baseDir: string
  ) {}

  execute<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T> {
    void sharedEngineSafe;
    return this.root.executeSafeIn<T>(this.baseDir, name, params);
  }

  executeBuiltin<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<T> {
    return this.root.execute<T>(name, params, sharedEngineSafe);
  }

  run<T = unknown>(script: string): Promise<T> {
    return this.root.run<T>(script);
  }
}
