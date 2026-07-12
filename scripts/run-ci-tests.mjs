import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

run(["--filter", "@ps-generator-bridge/sdk", "test"]);
run(["--filter", "@ps-generator-bridge/generator", "test"]);

if (existsSync("packages/cli/test")) {
  run(["--filter", "@ps-generator-bridge/cli", "exec", "vitest", "run", "--coverage"]);
} else {
  console.log("CLI test suite is not present yet; running its typecheck fallback.");
  run(["--filter", "@ps-generator-bridge/cli", "typecheck"]);
}

function run(args) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "pnpm";
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
