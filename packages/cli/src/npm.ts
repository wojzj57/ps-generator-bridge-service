import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface NpmClient {
  viewVersion(spec: string): string;
  install(args: string[], cwd: string): void;
}

export function createNpmClient(): NpmClient {
  return {
    viewVersion(spec) {
      const output = runNpm(["view", spec, "version", "--json"], undefined, true);
      const parsed = JSON.parse(output) as unknown;
      if (typeof parsed !== "string" || parsed.trim() === "") {
        throw new Error(`npm returned an invalid version for ${spec}`);
      }
      return parsed.trim();
    },
    install(args, cwd) {
      runNpm(["install", ...args], cwd, false);
    },
  };
}

function runNpm(args: string[], cwd: string | undefined, capture: boolean): string {
  const npmCli = resolveNpmCli();
  const stdio = capture ? (["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"]) : "inherit";
  if (npmCli) {
    return execFileSync(process.execPath, [npmCli, ...args], {
      cwd,
      encoding: "utf8",
      stdio,
    });
  }

  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio,
    shell: process.platform === "win32",
  });
}

function resolveNpmCli(): string | undefined {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /npm-cli\.js$/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return npmExecPath;
  }

  const nodeDir = dirname(process.execPath);
  const bundledNpm = join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledNpm)) return bundledNpm;

  try {
    return require.resolve("npm/bin/npm-cli.js");
  } catch {
    return undefined;
  }
}
