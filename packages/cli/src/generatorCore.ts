import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { satisfies } from "semver";
import { appRoot, generatorCoreDir, isManagedAppRoot, type PathEnvironment } from "./appPaths";
import type { RuntimeCache } from "./runtimeManager";

const REPO = "https://github.com/adobe-photoshop/generator-core";

export { generatorCoreDir } from "./appPaths";

export interface EnsureGeneratorCoreOptions extends PathEnvironment {
  update: boolean;
}

export async function ensureGeneratorCore(options: EnsureGeneratorCoreOptions): Promise<void> {
  const dir = generatorCoreDir(options);
  mkdirSync(dirname(dir), { recursive: true });
  warnAboutWorkspaceCopy();

  if (options.update && existsSync(join(dir, ".git"))) {
    run("git", ["pull", "--ff-only"], dir);
    run("npm", ["install"], dir);
    if (!isGeneratorCoreUsable(dir)) installFreshCore(dir);
    return;
  }

  if (isGeneratorCoreUsable(dir)) {
    console.log("[generator-core] complete cache present; skipping install");
    return;
  }

  if (
    existsSync(join(dir, ".git")) &&
    existsSync(join(dir, "app.js")) &&
    !existsSync(join(dir, "node_modules"))
  ) {
    run("npm", ["install"], dir);
    requireUsableCore(dir);
    return;
  }

  installFreshCore(dir);
}

export function isGeneratorCoreUsable(dir: string): boolean {
  return (
    existsSync(join(dir, ".git")) &&
    existsSync(join(dir, "app.js")) &&
    existsSync(join(dir, "node_modules")) &&
    existsSync(join(dir, "package.json"))
  );
}

export function assertGeneratorCoreCompatibility(runtime: RuntimeCache, coreDir: string): void {
  const range = runtime["generator-core-version"];
  if (!range) {
    throw new Error(
      `Generator runtime ${runtime.version} does not declare generator-core-version compatibility.`
    );
  }
  const packageJsonPath = join(coreDir, "package.json");
  let coreVersion: string | undefined;
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    if (typeof pkg.version === "string") coreVersion = pkg.version;
  } catch {
    // The actionable error below covers unreadable metadata.
  }
  if (!coreVersion) {
    throw new Error(`Cached generator-core has no readable version: ${packageJsonPath}`);
  }
  if (!satisfies(coreVersion, range, { includePrerelease: true })) {
    throw new Error(
      `Cached generator-core ${coreVersion} does not satisfy runtime requirement ${range}. Use run/dev --update-core or setup-core --update.`
    );
  }
}

export function cleanManagedCache(options: PathEnvironment = {}): void {
  const root = appRoot(options);
  if (!existsSync(root)) {
    console.log(`[cache] nothing to clean at ${root}`);
    return;
  }
  if (!isManagedAppRoot(options)) {
    throw new Error(`Refusing to clean an unmanaged directory: ${root}`);
  }
  rmSync(root, { recursive: true, force: true });
  console.log(`[cache] removed ${root}`);
}

function installFreshCore(dir: string): void {
  const parent = dirname(dir);
  const stage = join(parent, `.generator-core-install-${process.pid}-${Date.now()}`);
  const backup = join(parent, `.generator-core-backup-${process.pid}-${Date.now()}`);
  rmSync(stage, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  let movedCurrent = false;
  try {
    run("git", ["clone", "--depth", "1", REPO, stage], undefined);
    run("npm", ["install"], stage);
    requireUsableCore(stage);
    if (existsSync(dir)) {
      renameSync(dir, backup);
      movedCurrent = true;
    }
    renameSync(stage, dir);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedCurrent && !existsSync(dir) && existsSync(backup)) renameSync(backup, dir);
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
    if (existsSync(dir)) rmSync(backup, { recursive: true, force: true });
  }
}

function requireUsableCore(dir: string): void {
  if (!isGeneratorCoreUsable(dir)) {
    throw new Error(`generator-core installation is incomplete: ${dir}`);
  }
}

function run(command: string, args: string[], cwd: string | undefined): void {
  console.log(`[generator-core] ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function warnAboutWorkspaceCopy(): void {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (!workspaceRoot) return;
  const legacy = join(workspaceRoot, "generator-core");
  if (existsSync(legacy)) {
    console.warn(
      `[generator-core] ignoring legacy workspace checkout at ${legacy}; remove it manually after verifying the shared cache.`
    );
  }
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = resolve(start);
  const root = parse(current).root;
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    if (current === root) return undefined;
    current = dirname(current);
  }
}
