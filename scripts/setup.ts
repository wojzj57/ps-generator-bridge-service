// One-time dev setup: fetch Adobe's `generator-core` and install its deps.
//
// `generator-core` is the upstream Photoshop Generator host (the Node process
// Photoshop spawns). It is NOT a workspace member and NOT committed here; this
// script clones it into the repo-root `/generator-core` and runs `npm install`
// inside it so the plugins in this repo can run against the real host.
//
// Idempotent: if `generator-core` already has a checkout it is left in place
// (deps are still (re)installed). Run via `pnpm setup` (see package.json).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "https://github.com/adobe-photoshop/generator-core";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = resolve(repoRoot, "generator-core");

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[setup] ${msg}`);
}

function run(cmd: string, args: string[], cwd: string): void {
  log(`${cmd} ${args.join(" ")}  (in ${cwd})`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

if (existsSync(resolve(coreDir, ".git"))) {
  log(`generator-core already cloned: ${coreDir}`);
} else if (existsSync(coreDir)) {
  log(`generator-core dir exists but is not a git checkout, skipping clone: ${coreDir}`);
} else {
  run("git", ["clone", "--depth", "1", REPO, coreDir], repoRoot);
}

run("npm", ["install"], coreDir);
log("done");
