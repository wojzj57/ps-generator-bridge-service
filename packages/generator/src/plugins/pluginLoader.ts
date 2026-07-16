import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ErrorCode } from "@ps-generator-bridge/sdk";
import {
  type ApiHandler,
  type Logger,
  type MethodHandler,
  type PluginApiRoute,
  type PluginHost,
  type PluginInitContext,
  type PluginInitializer,
  type PluginRuntime,
} from "@ps-generator-bridge/sdk/plugin";
import { isValidPluginId } from "./pluginManager";
import { ScopedRegistry } from "./scopedRegistry";

export type PluginLoadPhase =
  | "manifest"
  | "import"
  | "identity"
  | "init"
  | "runtime-validation"
  | "registration";

export type PluginActivationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string; cleanupHandled?: boolean }>;

export interface LoadOptions {
  /** Explicit plugin package directories loaded before the collection directory. */
  pluginDirs?: readonly string[];
  /** Directory whose direct child folders are scanned as plugin packages. */
  pluginsDir: string;
  /** Build the plugin-scoped host after the final plugin id has been resolved. */
  hostFor: (pluginDir: string, pluginId: string) => PluginHost;
  /** Plugin ids already reserved outside this scan. */
  knownIds: Set<string>;
  /**
   * Optional activation boundary. Production registers the staged runtime with
   * PluginManager here; an id is claimed only after this returns ok.
   */
  activate?: (plugin: LoadedPlugin) => Promise<PluginActivationResult>;
  logger: Logger;
}

export interface LoadedPlugin {
  id: string;
  runtime: PluginRuntime;
  scoped: ScopedRegistry;
  /** Absolute package entry resolved from package.json `main`. */
  path: string;
}

export interface SkippedPlugin {
  path: string;
  id: string;
  code: string;
  phase: PluginLoadPhase;
  reason: string;
}

export interface LoadResult {
  loaded: LoadedPlugin[];
  skipped: SkippedPlugin[];
}

/** Parse a platform-delimited list of explicit plugin package directories. */
export function parsePluginPaths(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(delimiter)
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

/**
 * Load plugin packages in deterministic priority order. A package default
 * export is a synchronous initializer, never a class. Explicit package paths
 * win before the sorted collection directory, and the first candidate that
 * completes initialization/activation claims its id.
 */
export async function loadPlugins(options: LoadOptions): Promise<LoadResult> {
  const { pluginDirs = [], pluginsDir, hostFor, knownIds, activate, logger: log } = options;
  const loaded: LoadedPlugin[] = [];
  const skipped: SkippedPlugin[] = [];
  const taken = new Map<string, string>();
  for (const id of knownIds) taken.set(id, "<reserved>");

  const seenDirs = new Set<string>();
  const loadCandidate = async (dir: string, label: string): Promise<void> => {
    const outcome = await loadOne(dir, hostFor, taken, activate, log);
    if (outcome.kind === "loaded") {
      loaded.push(outcome.plugin);
      taken.set(outcome.plugin.id, label);
      log.info(`plugin loaded: ${label} (${outcome.plugin.id})`);
      return;
    }
    skipped.push({
      path: label,
      id: outcome.id ?? diagnosticId(dir),
      code: outcome.code ?? ErrorCode.PluginLoadFailed,
      phase: outcome.phase,
      reason: outcome.reason,
    });
    log.warn(`plugin skipped: ${label} [${outcome.phase}] - ${outcome.reason}`);
  };

  for (const rawDir of pluginDirs) {
    const dir = rawDir.trim();
    if (!dir) continue;
    const prepared = prepareExplicitPluginDir(dir);
    if (prepared.kind === "invalid") {
      skipped.push({
        path: dir,
        id: diagnosticId(dir),
        code: ErrorCode.PluginLoadFailed,
        phase: "manifest",
        reason: prepared.reason,
      });
      log.warn(`plugin skipped: ${dir} [manifest] - ${prepared.reason}`);
      continue;
    }
    if (seenDirs.has(prepared.key)) {
      log.debug(`duplicate plugin path ignored: ${dir}`);
      continue;
    }
    seenDirs.add(prepared.key);
    await loadCandidate(dir, dir);
  }

  let dirs: string[];
  try {
    dirs = scanPluginDirs(pluginsDir);
  } catch (error) {
    log.debug(`pluginsDir not loaded: ${pluginsDir} (${errorMessage(error)})`);
    return { loaded, skipped };
  }

  for (const name of dirs) {
    const dir = join(pluginsDir, name);
    const key = canonicalPluginDirKey(dir);
    if (key && seenDirs.has(key)) {
      log.debug(`duplicate plugin path ignored: ${dir}`);
      continue;
    }
    if (key) seenDirs.add(key);
    await loadCandidate(dir, name);
  }
  return { loaded, skipped };
}

type Outcome =
  | { kind: "loaded"; plugin: LoadedPlugin }
  | {
      kind: "skipped";
      id?: string;
      code?: string;
      phase: PluginLoadPhase;
      reason: string;
    };

interface PluginPackageJson {
  main?: unknown;
  name?: unknown;
  pluginId?: unknown;
}

async function loadOne(
  dir: string,
  hostFor: (pluginDir: string, pluginId: string) => PluginHost,
  taken: Map<string, string>,
  activate: LoadOptions["activate"],
  log: Logger
): Promise<Outcome> {
  let pkg: PluginPackageJson;
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PluginPackageJson;
  } catch (error) {
    return skip("manifest", `package.json missing or invalid: ${errorMessage(error)}`);
  }

  if (typeof pkg.main !== "string" || pkg.main.length === 0) {
    return skip("manifest", 'package.json has no "main"');
  }
  const root = resolve(dir);
  const entry = resolve(root, pkg.main);
  if (entry !== root && !entry.startsWith(root + sep)) {
    return skip("manifest", `"main" escapes the plugin directory: ${pkg.main}`);
  }

  let exported: unknown;
  try {
    const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
    exported = unwrapDefault(mod);
  } catch (error) {
    log.error(`plugin entry import failed: ${entry}`, errorStack(error));
    return skip("import", `load failed: ${errorMessage(error)}`);
  }

  if (isClassFunction(exported)) {
    return skip("import", "default export must be an initializer function, not a class");
  }
  if (typeof exported !== "function") {
    return skip("import", "default export is not a plugin initializer function");
  }
  const initializer = exported as PluginInitializer;

  const identity = resolvePluginId(pkg, initializer);
  if (!identity.ok) return skip("identity", identity.reason);
  const id = identity.id;
  if (!isValidPluginId(id)) {
    return skip("identity", `illegal id '${id}' (must match [A-Za-z0-9_-]+)`, id);
  }
  const owner = taken.get(id);
  if (owner !== undefined) {
    return skip("identity", `duplicate id '${id}' (already claimed by '${owner}')`, id);
  }

  let host: PluginHost;
  try {
    host = hostFor(dir, id);
  } catch (error) {
    log.error(`plugin ${id} host creation failed`, errorStack(error));
    return skip("init", `host creation failed: ${errorMessage(error)}`, id);
  }

  const scoped = new ScopedRegistry();
  const registration = createInitContext(id, host, scoped);
  let value: unknown;
  try {
    value = initializer(registration.context);
  } catch (error) {
    registration.close();
    safeDisposeHostEvents(host, id, log);
    log.error(`plugin ${id} init failed`, errorStack(error));
    return skip("init", errorMessage(error), id);
  }
  registration.close();

  if (isPromiseLike(value)) {
    void Promise.resolve(value).then(
      (lateRuntime) => safeDisposeUnknown(lateRuntime, id, log),
      (error) => log.error(`plugin ${id} async initializer rejected`, errorStack(error))
    );
    safeDisposeHostEvents(host, id, log);
    return skip("init", "plugin initializer must be synchronous", id);
  }

  const validation = validateRuntime(value, id);
  if (!validation.ok) {
    await safeDisposeUnknown(value, id, log);
    safeDisposeHostEvents(host, id, log);
    return skip("runtime-validation", validation.reason, id);
  }

  const plugin: LoadedPlugin = { id, runtime: validation.runtime, scoped, path: entry };
  if (activate) {
    let activated: PluginActivationResult;
    try {
      activated = await activate(plugin);
    } catch (error) {
      log.error(`plugin ${id} registration failed`, errorStack(error));
      await safeDisposeUnknown(plugin.runtime, id, log);
      safeDisposeHostEvents(host, id, log);
      return skip("registration", errorMessage(error), id, ErrorCode.PluginRegistrationFailed);
    }
    if (!activated.ok) {
      if (!activated.cleanupHandled) {
        await safeDisposeUnknown(plugin.runtime, id, log);
        safeDisposeHostEvents(host, id, log);
      }
      return skip("registration", activated.reason, id, ErrorCode.PluginRegistrationFailed);
    }
  }
  return { kind: "loaded", plugin };
}

function unwrapDefault(mod: Record<string, unknown>): unknown {
  let exported: unknown = mod.default ?? mod;
  if (exported !== null && typeof exported === "object") {
    const inner = (exported as Record<string, unknown>).default;
    if (inner !== undefined) exported = inner;
  }
  return exported;
}

type IdentityResult = { ok: true; id: string } | { ok: false; reason: string };

function resolvePluginId(pkg: PluginPackageJson, initializer: PluginInitializer): IdentityResult {
  const manifest = optionalId(pkg, "pluginId", "package.json pluginId");
  if (!manifest.ok) return manifest;

  let rawInitializerId: unknown;
  try {
    rawInitializerId = initializer.pluginId;
  } catch (error) {
    return { ok: false, reason: `initializer pluginId could not be read: ${errorMessage(error)}` };
  }
  const code = normalizeOptionalId(rawInitializerId, "initializer pluginId");
  if (!code.ok) return code;

  if (manifest.id !== undefined && code.id !== undefined && manifest.id !== code.id) {
    return {
      ok: false,
      reason: `pluginId mismatch: package.json declares '${manifest.id}', initializer declares '${code.id}'`,
    };
  }
  const explicit = manifest.id ?? code.id;
  if (explicit !== undefined) return { ok: true, id: explicit };
  if (typeof pkg.name !== "string" || pkg.name.length === 0) {
    return { ok: false, reason: "missing pluginId and package.json name" };
  }
  return { ok: true, id: pkg.name };
}

function optionalId(
  object: PluginPackageJson,
  key: "pluginId",
  label: string
): { ok: true; id?: string } | { ok: false; reason: string } {
  return normalizeOptionalId(object[key], label);
}

function normalizeOptionalId(
  value: unknown,
  label: string
): { ok: true; id?: string } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: `${label} must be a non-empty string` };
  }
  return { ok: true, id: value };
}

function createInitContext(
  pluginId: string,
  host: PluginHost,
  scoped: ScopedRegistry
): { context: PluginInitContext; close(): void } {
  let open = true;
  const assertOpen = (): void => {
    if (!open) throw new Error(`plugin '${pluginId}' registration context is closed`);
  };
  const context: PluginInitContext = Object.freeze({
    pluginId,
    host,
    ws(name: string, handler: MethodHandler): void {
      assertOpen();
      scoped.registerMethod(name, handler);
    },
    api(route: PluginApiRoute, handler: ApiHandler): void {
      assertOpen();
      const normalized =
        typeof route === "string"
          ? { method: "GET" as const, url: route, handler }
          : { method: route.method ?? ("GET" as const), url: route.url, handler };
      scoped.registerApi(normalized);
    },
  });
  return { context, close: () => void (open = false) };
}

type RuntimeValidation = { ok: true; runtime: PluginRuntime } | { ok: false; reason: string };

function validateRuntime(value: unknown, pluginId: string): RuntimeValidation {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "plugin initializer must return a PluginRuntime object" };
  }
  try {
    const runtime = value as PluginRuntime;
    if (runtime.pluginId !== undefined) {
      if (typeof runtime.pluginId !== "string") {
        return { ok: false, reason: "runtime pluginId must be a string" };
      }
      if (runtime.pluginId !== pluginId) {
        return {
          ok: false,
          reason: `runtime pluginId '${runtime.pluginId}' does not match resolved pluginId '${pluginId}'`,
        };
      }
    }
    for (const hook of ["onConnect", "onDisconnect", "onDispose"] as const) {
      if (runtime[hook] !== undefined && typeof runtime[hook] !== "function") {
        return { ok: false, reason: `${hook} must be a function` };
      }
    }
    return { ok: true, runtime };
  } catch (error) {
    return { ok: false, reason: `runtime validation failed: ${errorMessage(error)}` };
  }
}

async function safeDisposeUnknown(value: unknown, pluginId: string, log: Logger): Promise<void> {
  if (typeof value !== "object" || value === null) return;
  try {
    const dispose = (value as { onDispose?: unknown }).onDispose;
    if (typeof dispose === "function") await dispose.call(value);
  } catch (error) {
    log.error(`plugin ${pluginId} cleanup failed`, errorStack(error));
  }
}

function safeDisposeHostEvents(host: PluginHost, pluginId: string, log: Logger): void {
  try {
    host.events.dispose();
  } catch (error) {
    log.error(`plugin ${pluginId} event cleanup failed`, errorStack(error));
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      ((typeof value === "object" && value !== null) || typeof value === "function") &&
      typeof (value as { then?: unknown }).then === "function"
    );
  } catch {
    return false;
  }
}

function isClassFunction(value: unknown): boolean {
  if (typeof value !== "function") return false;
  try {
    return /^\s*class\b/.test(Function.prototype.toString.call(value));
  } catch {
    return false;
  }
}

function skip(phase: PluginLoadPhase, reason: string, id?: string, code?: string): Outcome {
  return { kind: "skipped", phase, reason, id, code };
}

type PreparedPluginDir = { kind: "valid"; key: string } | { kind: "invalid"; reason: string };

function prepareExplicitPluginDir(dir: string): PreparedPluginDir {
  if (!isAbsolute(dir)) return { kind: "invalid", reason: "plugin path must be absolute" };
  let canonical: string;
  try {
    canonical = realpathSync(dir);
  } catch (error) {
    return { kind: "invalid", reason: `plugin path is unavailable: ${errorMessage(error)}` };
  }
  try {
    if (!statSync(canonical).isDirectory()) {
      return { kind: "invalid", reason: "plugin path is not a directory" };
    }
  } catch (error) {
    return { kind: "invalid", reason: `plugin path is unavailable: ${errorMessage(error)}` };
  }
  return { kind: "valid", key: normalizeCanonicalPath(canonical) };
}

function canonicalPluginDirKey(dir: string): string | undefined {
  try {
    return normalizeCanonicalPath(realpathSync(dir));
  } catch {
    return undefined;
  }
}

function normalizeCanonicalPath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function diagnosticId(dir: string): string {
  return basename(dir) || dir;
}

function scanPluginDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        entry.name !== "node_modules" &&
        !entry.name.startsWith(".")
    )
    .map((entry) => entry.name)
    .sort();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): unknown {
  return error instanceof Error ? (error.stack ?? error.message) : error;
}
