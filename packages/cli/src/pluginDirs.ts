import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { PLUGINS_MARKER, pluginsSnapshotDir } from "./appPaths";
import type { PathEnvironment } from "./appPaths";
import type { HarnessOptions } from "./core";

const MARKER_CONTENT = "ps-generator-bridge plugins snapshot\n";

export interface PluginSource {
  pluginsDir: string;
  linkPath?: string;
}

export async function preparePluginSource(
  options: HarnessOptions,
  paths: PathEnvironment = {}
): Promise<PluginSource> {
  if (options.pluginsDir) {
    return { pluginsDir: requireDirectory(options.pluginsDir, "--plugins-dir") };
  }

  const input = options.pluginCwd ? process.cwd() : options.plugin;
  const flag = options.pluginCwd ? "--plugin-cwd" : "--plugin";
  const pluginDir = requireDirectory(input, flag);
  requirePackageEntry(pluginDir);
  requireOutsideSnapshot(pluginDir, pluginsSnapshotDir(paths));
  const pluginsDir = resetManagedSnapshot(paths);
  const linkPath = join(pluginsDir, safeName(basename(pluginDir)));
  symlinkSync(pluginDir, linkPath, process.platform === "win32" ? "junction" : "dir");
  return { pluginsDir, linkPath };
}

export async function cleanupPluginSource(source: PluginSource): Promise<void> {
  if (source.linkPath) rmSync(source.linkPath, { recursive: true, force: true });
}

export function scanPluginCandidates(pluginsDir: string): string[] {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) return false;
      if (entry.isDirectory()) return true;
      if (!entry.isSymbolicLink()) return false;
      return lstatSync(join(pluginsDir, entry.name)).isSymbolicLink();
    })
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(pluginsDir, name, "package.json")))
    .sort();
}

function resetManagedSnapshot(paths: PathEnvironment): string {
  const dir = pluginsSnapshotDir(paths);
  if (existsSync(dir)) {
    const entries = readdirSync(dir);
    const marker = join(dir, PLUGINS_MARKER);
    if (entries.length > 0 && !isValidMarker(marker)) {
      throw new Error(
        `Refusing to replace a non-empty plugins directory not managed by the CLI: ${dir}`
      );
    }
    for (const name of entries) rmSync(join(dir, name), { recursive: true, force: true });
  } else {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, PLUGINS_MARKER), MARKER_CONTENT);
  return dir;
}

function isValidMarker(path: string): boolean {
  return existsSync(path) && readFileSync(path, "utf8") === MARKER_CONTENT;
}

function requireOutsideSnapshot(pluginDir: string, snapshotDir: string): void {
  const relation = relative(resolve(snapshotDir), resolve(pluginDir));
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) {
    throw new Error(`--plugin must not point inside the managed plugins directory: ${pluginDir}`);
  }
}

function requireDirectory(input: string | undefined, flag: string): string {
  if (!input) throw new Error(`${flag} is required`);
  let dir: string;
  try {
    dir = realpathSync(resolve(input));
  } catch {
    throw new Error(`${flag} must point to an existing directory: ${input}`);
  }
  if (!lstatSync(dir).isDirectory()) throw new Error(`${flag} must point to a directory: ${input}`);
  return dir;
}

function requirePackageEntry(dir: string): void {
  const packageJson = join(dir, "package.json");
  if (!existsSync(packageJson)) throw new Error(`Plugin directory has no package.json: ${dir}`);
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_") || "plugin";
}
