import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const REPO = "https://github.com/adobe-photoshop/generator-core";

export function generatorCoreDir(): string {
  const root = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(root, "ps-bridge-test", "generator-core", "master");
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
