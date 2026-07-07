import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

const REPO = "https://github.com/adobe-photoshop/generator-core";

export function generatorCoreDir(): string {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) return join(workspaceRoot, "generator-core");
  return join(cacheRoot(), "ps-generator-bridge", "generator-core");
}

export async function ensureGeneratorCore(options: { update: boolean }): Promise<void> {
  const dir = generatorCoreDir();
  mkdirSync(dirname(dir), { recursive: true });

  if (!existsSync(join(dir, ".git"))) {
    run("git", ["clone", REPO, dir], undefined);
  } else if (options.update) {
    run("git", ["pull", "--ff-only"], dir);
  }

  if (options.update || !existsSync(join(dir, "node_modules"))) {
    run("npm", ["install"], dir);
  } else {
    console.log(
      "[generator-core] node_modules present; skipping npm install (use --update to refresh)"
    );
  }
}

export function cleanGeneratorCore(): void {
  if (findWorkspaceRoot(process.cwd())) {
    console.log(
      "[generator-core] running inside a workspace; the generator-core clone is managed by `pnpm setup` and was not removed."
    );
    return;
  }

  const dir = generatorCoreDir();
  if (!existsSync(dir)) {
    console.log(`[generator-core] nothing to clean at ${dir}`);
    return;
  }

  rmSync(dir, { recursive: true, force: true });
  console.log(`[generator-core] removed ${dir}`);
}

function cacheRoot(): string {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches");
  }
  return process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
}

function run(command: string, args: string[], cwd: string | undefined): void {
  console.log(`[generator-core] ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
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
