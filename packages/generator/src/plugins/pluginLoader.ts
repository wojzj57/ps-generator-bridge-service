import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ErrorCode } from "@ps-generator-bridge/sdk";
import {
  isBasePluginClass,
  type BasePlugin,
  type PluginHost,
} from "@ps-generator-bridge/sdk/plugin";
import { isValidPluginId } from "./pluginManager";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";

export interface LoadOptions {
  /** Directory whose direct child folders are scanned as plugin packages. */
  pluginsDir: string;
  /**
   * Builds the host contract for a plugin, given that plugin's package dir
   * (RFC 0005). The loader calls it once per plugin and passes the result to the
   * plugin's constructor, so each plugin can receive a `jsx` scoped to its own
   * `<pluginDir>/jsx`. The loader stays ignorant of jsx scoping — `PsBridgeHost`
   * owns the per-plugin wrapper.
   */
  hostFor: (pluginDir: string, pluginId: string) => PluginHost;
  /** Plugin ids already taken — enforced unique across the whole load. */
  knownIds: Set<string>;
  logger: Logger;
}

export interface LoadedPlugin {
  id: string;
  plugin: BasePlugin;
  /** Absolute path of the package entry (resolved from package.json `main`). */
  path: string;
}

export interface SkippedPlugin {
  /** Folder name under pluginsDir, for readable logs. */
  path: string;
  /** Stable diagnostic id. Uses static plugin id when available, else folder name. */
  id: string;
  code: string;
  reason: string;
}

export interface LoadResult {
  loaded: LoadedPlugin[];
  skipped: SkippedPlugin[];
}

/**
 * Plugin loader. Scans the *direct* child folders of `pluginsDir` (flat, one
 * level — `node_modules` and dotfolders are ignored), and treats each as an npm
 * package: it reads the folder's `package.json`, resolves the `main` entry, and
 * loads it via dynamic `import()` with CJS interop (`mod.default ?? mod`). The
 * default export must be a `BasePlugin` subclass with a legal, unique `static
 * id`; it is constructed with `(id, host)`.
 *
 * A plugin's own dependencies resolve from its own `node_modules` via Node's
 * native module resolution (the entry's requires walk up from the entry file),
 * so a plugin ships with its dependencies installed beside it — the loader adds
 * no resolution machinery of its own.
 *
 * Invalid or broken packages are skipped with a `log.warn` naming the folder
 * and reason — one bad package never stops the others or the host. A folder with
 * no `package.json`, or a `package.json` with no `main`, is skipped. A missing
 * `pluginsDir` is the default state (no plugins installed) and is a debug log.
 * `isBasePluginClass` (a global brand) makes validation work even when the
 * package bundles its own SDK copy.
 */
export async function loadPlugins(options: LoadOptions): Promise<LoadResult> {
  const { pluginsDir, hostFor, knownIds, logger: log } = options;
  const loaded: LoadedPlugin[] = [];
  const skipped: SkippedPlugin[] = [];
  const taken = new Set(knownIds);

  let dirs: string[];
  try {
    dirs = scanPluginDirs(pluginsDir);
  } catch (err) {
    log.debug(`pluginsDir not loaded: ${pluginsDir} (${(err as Error).message})`);
    return { loaded, skipped };
  }

  for (const name of dirs) {
    const dir = join(pluginsDir, name);
    const outcome = await loadOne(dir, hostFor, taken);
    if (outcome.kind === "loaded") {
      loaded.push({ id: outcome.id, plugin: outcome.plugin, path: outcome.path });
      taken.add(outcome.id);
      log.info(`plugin loaded: ${name} (${outcome.id})`);
    } else {
      skipped.push({
        path: name,
        id: outcome.id ?? name,
        code: ErrorCode.PluginLoadFailed,
        reason: outcome.reason,
      });
      log.warn(`plugin skipped: ${name} — ${outcome.reason}`);
    }
  }
  return { loaded, skipped };
}

type Outcome =
  | { kind: "loaded"; id: string; plugin: BasePlugin; path: string }
  | { kind: "skipped"; id?: string; reason: string };

async function loadOne(
  dir: string,
  hostFor: (pluginDir: string, pluginId: string) => PluginHost,
  taken: Set<string>
): Promise<Outcome> {
  // Read + parse package.json.
  let pkg: { main?: unknown };
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { main?: unknown };
  } catch (err) {
    return {
      kind: "skipped",
      reason: `package.json missing or invalid: ${(err as Error).message}`,
    };
  }

  // The entry is the package's `main`; a package with no `main` is skipped.
  if (typeof pkg.main !== "string" || pkg.main.length === 0) {
    return { kind: "skipped", reason: 'package.json has no "main"' };
  }

  // Resolve the entry within the plugin folder; reject a `main` that escapes it.
  const root = resolve(dir);
  const entry = resolve(root, pkg.main);
  if (entry !== root && !entry.startsWith(root + sep)) {
    return { kind: "skipped", reason: `"main" escapes the plugin directory: ${pkg.main}` };
  }

  let mod: Record<string, unknown>;
  try {
    // Node's ESM loader requires a file:// URL for absolute paths; a bare
    // Windows path like `d:\...` is read as a protocol and rejected.
    mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  } catch (err) {
    return { kind: "skipped", reason: `load failed: ${(err as Error).message}` };
  }

  // CJS interop for dynamic import(): node exposes a CJS module's `module.exports`
  // as the namespace `default`. A bundler's `export default` (tsup) yields
  // `module.exports.default = S` which the import() lexer may not flatten, so the
  // namespace `default` is the whole exports object carrying an inner `default`.
  // Unwrap one such inner default; a bare `module.exports = S` (a function/class)
  // is taken as-is.
  let S: unknown = mod.default ?? mod;
  if (S !== null && typeof S === "object") {
    const inner = (S as Record<string, unknown>).default;
    if (inner !== undefined) S = inner;
  }

  if (!isBasePluginClass(S)) {
    return { kind: "skipped", reason: "default export is not a BasePlugin subclass" };
  }
  const id = (S as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    return { kind: "skipped", reason: "missing static id" };
  }
  if (!isValidPluginId(id)) {
    return { kind: "skipped", reason: `illegal id '${id}' (must match [A-Za-z0-9_-]+)` };
  }
  if (taken.has(id)) {
    return { kind: "skipped", id, reason: `duplicate id '${id}'` };
  }
  try {
    const host = hostFor(dir, id);
    const plugin = new (S as new (id: string, host: PluginHost) => BasePlugin)(id, host);
    return { kind: "loaded", id, plugin, path: entry };
  } catch (err) {
    return { kind: "skipped", id, reason: `construct failed: ${(err as Error).message}` };
  }
}

/**
 * List the direct child folder names of `pluginsDir`, sorted for deterministic
 * load order. `node_modules` and dotfolders are skipped. Throws if `pluginsDir`
 * itself is missing (caller treats that as "no plugins installed").
 */
function scanPluginDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}
