import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export const APP_DIR_NAME = "ps-generator-bridge";
export const APP_MARKER = ".ps-generator-bridge-managed";
export const PLUGINS_MARKER = ".ps-generator-bridge-plugins-managed";
const ADOPTABLE_ENTRIES = new Set(["generator-core", "generator-runtime", "plugins"]);

export interface PathEnvironment {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export function cacheRoot(options: PathEnvironment = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const path = pathApi(platform);
  if (platform === "win32") return env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  if (platform === "darwin") return path.join(home, "Library", "Caches");
  return env.XDG_CACHE_HOME ?? path.join(home, ".cache");
}

export function appRoot(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(cacheRoot(options), APP_DIR_NAME);
}

export function generatorCoreDir(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(appRoot(options), "generator-core");
}

export function generatorRuntimeDir(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(appRoot(options), "generator-runtime");
}

export function generatorRuntimePackageDir(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(
    generatorRuntimeDir(options),
    "node_modules",
    "@ps-generator-bridge",
    "generator"
  );
}

export function pluginsSnapshotDir(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(appRoot(options), "plugins");
}

export function operationLockPath(options: PathEnvironment = {}): string {
  return pathApi(options.platform ?? process.platform).join(appRoot(options), ".operation.lock");
}

export function ensureManagedAppRoot(options: PathEnvironment = {}): string {
  const root = appRoot(options);
  mkdirSync(root, { recursive: true });
  const marker = pathApi(options.platform ?? process.platform).join(root, APP_MARKER);
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() !== APP_DIR_NAME) {
    throw new Error(`Refusing to use an application directory with an invalid marker: ${root}`);
  }
  if (!existsSync(marker)) {
    const unexpected = readdirSync(root).filter(
      (name) => !ADOPTABLE_ENTRIES.has(name) && !name.startsWith(".generator-")
    );
    if (unexpected.length > 0) {
      throw new Error(
        `Refusing to manage a non-empty application directory with unknown entries: ${root}`
      );
    }
    try {
      writeFileSync(marker, `${APP_DIR_NAME}\n`, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return root;
}

export function isManagedAppRoot(options: PathEnvironment = {}): boolean {
  const marker = pathApi(options.platform ?? process.platform).join(appRoot(options), APP_MARKER);
  return existsSync(marker) && readFileSync(marker, "utf8").trim() === APP_DIR_NAME;
}

function pathApi(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === "win32" ? win32 : posix;
}
