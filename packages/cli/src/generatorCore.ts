import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

const REPO = "https://github.com/adobe-photoshop/generator-core";

export function generatorCoreDir(): string {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) return join(workspaceRoot, "generator-core");
  return join(tmpdir(), "ps-generator-bridge", "generator-core");
}

export async function ensureGeneratorCore(options: { update: boolean }): Promise<void> {
  const dir = generatorCoreDir();
  mkdirSync(dirname(dir), { recursive: true });

  if (!existsSync(join(dir, ".git"))) {
    run("git", ["clone", REPO, dir], undefined);
  } else if (options.update) {
    run("git", ["pull", "--ff-only"], dir);
  }

  run("npm", ["install"], dir);
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
