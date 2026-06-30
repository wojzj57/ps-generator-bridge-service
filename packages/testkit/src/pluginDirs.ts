import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { HarnessOptions } from "./core";

export interface PluginSource {
  pluginsDir: string;
  cleanupDir?: string;
}

export async function preparePluginSource(options: HarnessOptions): Promise<PluginSource> {
  if (options.pluginsDir) {
    const pluginsDir = requireDirectory(options.pluginsDir, "--plugins-dir");
    return { pluginsDir };
  }

  const pluginDir = requireDirectory(options.plugin, "--plugin");
  requirePackageEntry(pluginDir);
  const tempRoot = mkdtempSync(join(tmpdir(), "ps-bridge-test-"));
  const pluginsDir = join(tempRoot, "plugins");
  const linkName = safeName(basename(pluginDir));
  const linkPath = join(pluginsDir, linkName);
  rmSync(pluginsDir, { recursive: true, force: true });
  mkdirSync(pluginsDir, { recursive: true });
  symlinkSync(pluginDir, linkPath, process.platform === "win32" ? "junction" : "dir");
  return { pluginsDir, cleanupDir: tempRoot };
}

export async function cleanupPluginSource(source: PluginSource): Promise<void> {
  if (source.cleanupDir) rmSync(source.cleanupDir, { recursive: true, force: true });
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

function requireDirectory(input: string | undefined, flag: string): string {
  if (!input) throw new Error(`${flag} is required`);
  const dir = realpathSync(resolve(input));
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
