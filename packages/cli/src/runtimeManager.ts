import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { valid } from "semver";
import { generatorRuntimeDir, generatorRuntimePackageDir, type PathEnvironment } from "./appPaths";
import { createNpmClient, type NpmClient } from "./npm";

export const GENERATOR_PACKAGE = "@ps-generator-bridge/generator";
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
  npm?: NpmClient;
  warn?: (message: string) => void;
}

export function ensureGeneratorRuntime(options: EnsureRuntimeOptions = {}): RuntimeCache {
  const requested = options.version ?? DEFAULT_RUNTIME_VERSION;
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(requested)) {
    throw new Error(`Invalid generator runtime version or tag: ${requested}`);
  }
  const npm = options.npm ?? createNpmClient();
  const warn = options.warn ?? console.warn;
  const cached = inspectRuntimeCache(options);

  let desiredVersion: string;
  try {
    desiredVersion = npm.viewVersion(`${GENERATOR_PACKAGE}@${requested}`);
    if (!valid(desiredVersion)) {
      throw new Error(`npm returned an invalid generator runtime version: ${desiredVersion}`);
    }
  } catch (error) {
    if (cached && canUseOfflineCache(requested, cached.version)) {
      warn(
        `[generator-runtime] unable to check ${requested}; using cached ${cached.version}: ${errorMessage(error)}`
      );
      return cached;
    }
    throw new Error(
      `Unable to resolve ${GENERATOR_PACKAGE}@${requested} and no matching runtime cache is available: ${errorMessage(error)}`
    );
  }

  if (cached?.version === desiredVersion) {
    console.log(`[generator-runtime] ${desiredVersion} is current; using cached runtime`);
    return cached;
  }

  try {
    return installRuntimeVersion(desiredVersion, npm, options);
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
    // The generator package owns its payload layout. Keep cache discovery independent
    // of version-specific directories such as vendor/ or native/.
    if (
      pkg.name !== GENERATOR_PACKAGE ||
      typeof pkg.version !== "string" ||
      pkg.version.length === 0 ||
      !existsSync(join(packageDir, main))
    ) {
      return undefined;
    }
    return { ...pkg, packageDir };
  } catch {
    return undefined;
  }
}

function installRuntimeVersion(
  version: string,
  npm: NpmClient,
  options: PathEnvironment
): RuntimeCache {
  const target = generatorRuntimeDir(options);
  const parent = dirname(target);
  const stage = join(parent, `.generator-runtime-install-${process.pid}-${Date.now()}`);
  const backup = join(parent, `.generator-runtime-backup-${process.pid}-${Date.now()}`);
  mkdirSync(parent, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: { [GENERATOR_PACKAGE]: version },
      },
      null,
      2
    )}\n`
  );

  console.log(`[generator-runtime] installing ${GENERATOR_PACKAGE}@${version}`);
  let movedCurrent = false;
  try {
    npm.install(
      [
        `${GENERATOR_PACKAGE}@${version}`,
        "--save-exact",
        "--omit=dev",
        "--package-lock=false",
        "--no-audit",
        "--no-fund",
      ],
      stage
    );
    const installed = inspectRuntimePackage(
      join(stage, "node_modules", "@ps-generator-bridge", "generator")
    );
    // npm owns version selection; the CLI only checks that the installed package is loadable.
    if (!installed) {
      throw new Error(`Installed package is not a loadable ${GENERATOR_PACKAGE} runtime`);
    }

    rmSync(backup, { recursive: true, force: true });
    if (existsSync(target)) {
      renameSync(target, backup);
      movedCurrent = true;
    }
    renameSync(stage, target);
    rmSync(backup, { recursive: true, force: true });
    return { ...installed, packageDir: generatorRuntimePackageDir(options) };
  } catch (error) {
    if (movedCurrent && !existsSync(target) && existsSync(backup)) renameSync(backup, target);
    throw new Error(`Failed to install generator runtime ${version}: ${errorMessage(error)}`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    if (existsSync(target)) rmSync(backup, { recursive: true, force: true });
  }
}

function canUseOfflineCache(requested: string, cachedVersion: string): boolean {
  return requested === DEFAULT_RUNTIME_VERSION || requested === cachedVersion;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
