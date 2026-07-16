import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { valid } from "semver";
import { generatorRuntimeDir, generatorRuntimePackageDir, type PathEnvironment } from "./appPaths";
import {
  createGitHubReleaseClient,
  GENERATOR_PACKAGE,
  type ResolvedRuntimeRelease,
  type RuntimeReleaseClient,
} from "./githubRelease";

export { GENERATOR_PACKAGE } from "./githubRelease";
export const DEFAULT_RUNTIME_VERSION = "latest";

export interface RuntimePackageJson {
  name: string;
  version: string;
  main?: string;
  dependencies?: Record<string, string>;
  "generator-core-version"?: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: unknown;
  bugs?: unknown;
  keywords?: string[];
  os?: string[];
  cpu?: string[];
  types?: string;
  exports?: unknown;
}

export interface RuntimeCache extends RuntimePackageJson {
  packageDir: string;
}

export interface EnsureRuntimeOptions extends PathEnvironment {
  version?: string;
  releaseClient?: RuntimeReleaseClient;
  runtimePlatform?: NodeJS.Platform;
  warn?: (message: string) => void;
}

export function ensureGeneratorRuntime(options: EnsureRuntimeOptions = {}): RuntimeCache {
  const platform = options.runtimePlatform ?? process.platform;
  if (platform !== "win32") {
    throw new Error(`Generator runtime setup only supports Windows; received ${platform}.`);
  }
  const requested = options.version ?? DEFAULT_RUNTIME_VERSION;
  if (
    requested !== DEFAULT_RUNTIME_VERSION &&
    (valid(requested) !== requested || requested.includes("+"))
  ) {
    throw new Error(
      `Invalid generator runtime version: ${requested}; use latest or an exact semver`
    );
  }
  const warn = options.warn ?? console.warn;
  const releaseClient =
    options.releaseClient ?? createGitHubReleaseClient({ env: options.env, warn });
  const cached = inspectRuntimeCache(options);

  let desiredVersion: string;
  let resolvedRelease: ResolvedRuntimeRelease | undefined;
  try {
    if (requested === DEFAULT_RUNTIME_VERSION) {
      resolvedRelease = releaseClient.resolve(requested);
      desiredVersion = resolvedRelease.version;
    } else {
      desiredVersion = requested;
    }
  } catch (error) {
    if (cached && canUseOfflineCache(requested, cached.version)) {
      warn(
        `[generator-runtime] unable to check ${requested}; using cached ${cached.version}: ${errorMessage(error)}`
      );
      return cached;
    }
    throw new Error(
      `Unable to resolve the Generator GitHub Release for ${requested} and no matching runtime cache is available: ${errorMessage(error)}`
    );
  }

  if (cached?.version === desiredVersion) {
    console.log(`[generator-runtime] ${desiredVersion} is current; using cached runtime`);
    return cached;
  }

  try {
    const release = resolvedRelease ?? releaseClient.resolve(desiredVersion);
    return installRuntimeRelease(release.version, releaseClient, release, options, warn);
  } catch (error) {
    if (cached && requested === DEFAULT_RUNTIME_VERSION) {
      warn(
        `[generator-runtime] failed to install ${desiredVersion}; using cached ${cached.version}: ${errorMessage(error)}`
      );
      return cached;
    }
    throw error;
  }
}

export function inspectRuntimeCache(options: PathEnvironment = {}): RuntimeCache | undefined {
  return inspectRuntimePackage(generatorRuntimePackageDir(options));
}

export function inspectRuntimePackage(packageDir: string): RuntimeCache | undefined {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as RuntimePackageJson;
    const main = pkg.main ?? "main.js";
    const mainPath = typeof main === "string" ? resolve(packageDir, main) : "";
    const relativeMain = mainPath ? relative(packageDir, mainPath) : "..";
    // The generator package owns its payload layout. Keep cache discovery independent
    // of version-specific directories such as vendor/ or native/.
    if (
      pkg.name !== GENERATOR_PACKAGE ||
      typeof pkg.version !== "string" ||
      valid(pkg.version) !== pkg.version ||
      pkg.version.includes("+") ||
      relativeMain === ".." ||
      relativeMain.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativeMain) ||
      !lstatSync(mainPath).isFile()
    ) {
      return undefined;
    }
    return { ...pkg, packageDir };
  } catch {
    return undefined;
  }
}

function installRuntimeRelease(
  version: string,
  releaseClient: RuntimeReleaseClient,
  release: { version: string; assetUrl: string },
  options: PathEnvironment,
  warn: (message: string) => void
): RuntimeCache {
  const target = generatorRuntimeDir(options);
  const parent = dirname(target);
  const stage = join(parent, `.generator-runtime-install-${process.pid}-${Date.now()}`);
  const backup = join(parent, `.generator-runtime-backup-${process.pid}-${Date.now()}`);
  mkdirSync(parent, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  const stagePackageDir = join(stage, "node_modules", "@ps-generator-bridge", "generator");
  mkdirSync(stagePackageDir, { recursive: true });

  console.log(
    `[generator-runtime] downloading ${GENERATOR_PACKAGE}@${version} from GitHub Releases`
  );
  let movedCurrent = false;
  try {
    releaseClient.install(release, stagePackageDir);
    const installed = inspectRuntimePackage(stagePackageDir);
    if (!installed || installed.version !== version) {
      throw new Error(`Downloaded package is not ${GENERATOR_PACKAGE}@${version}`);
    }

    rmSync(backup, { recursive: true, force: true });
    if (existsSync(target)) {
      renameSync(target, backup);
      movedCurrent = true;
    }
    renameSync(stage, target);
    movedCurrent = false;
    try {
      rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      warn(
        `[generator-runtime] runtime updated, but the old backup could not be removed: ${errorMessage(error)}`
      );
    }
    return { ...installed, packageDir: generatorRuntimePackageDir(options) };
  } catch (error) {
    if (movedCurrent && !existsSync(target) && existsSync(backup)) {
      renameSync(backup, target);
      movedCurrent = false;
    }
    throw new Error(
      `Failed to install generator runtime ${version} from GitHub Releases: ${errorMessage(error)}`
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
    if (!movedCurrent && existsSync(backup)) {
      try {
        rmSync(backup, { recursive: true, force: true });
      } catch {
        // A stale .generator-* backup is safe and will be retried by the next locked update.
      }
    }
  }
}

function canUseOfflineCache(requested: string, cachedVersion: string): boolean {
  return requested === DEFAULT_RUNTIME_VERSION || requested === cachedVersion;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
