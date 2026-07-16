import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const MAIN_JS = path.resolve(__dirname, "../main.js");

async function executeMainEntry(
  packageDir: string,
  env: Record<string, string | undefined> = {},
  onLoadEnvironment: (
    packageDir: string,
    processEnv: Record<string, string | undefined>
  ) => void = () => undefined
): Promise<{
  bundleEnv: Record<string, string | undefined>;
  environmentCalls: string[];
  exports: unknown;
}> {
  const code = fs.readFileSync(MAIN_JS, "utf8");
  const module = { exports: undefined as unknown };
  let bundleEnv: Record<string, string | undefined> = {};
  const environmentCalls: string[] = [];
  const processLike = { env: { ...env } };

  const context = vm.createContext({
    __dirname: packageDir,
    module,
    exports: module.exports,
    process: processLike,
    require(request: string) {
      if (request === "fs") return fs;
      if (request === "./dist/environment.js") {
        return {
          loadEnvironment(dir: string) {
            environmentCalls.push(dir);
            onLoadEnvironment(dir, processLike.env);
          },
        };
      }
      if (request === "path") return path;
      if (request === "./dist/index.js") {
        bundleEnv = { ...processLike.env };
        return { init: "bundle" };
      }
      throw new Error(`Unexpected require: ${request}`);
    },
  });

  new vm.Script(code, { filename: MAIN_JS }).runInContext(context);

  return {
    bundleEnv,
    environmentCalls,
    exports: module.exports,
  };
}

describe("generator main entry", () => {
  it("loads package-local .env before requiring the bundle", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ps-bridge-main-"));

    const result = await executeMainEntry(dir, { EXISTING: "from-process" }, (_options, env) => {
      env.PS_BRIDGE_PORT = "8800";
      env.PS_BRIDGE_COS_SECRET_ID = "from-env";
      env.PS_BRIDGE_LOG_DIR = "custom-logs";
    });

    expect(result.exports).toEqual({ init: "bundle" });
    expect(result.environmentCalls).toEqual([dir]);
    expect(result.bundleEnv).toMatchObject({
      PS_BRIDGE_PORT: "8800",
      PS_BRIDGE_COS_SECRET_ID: "from-env",
      PS_BRIDGE_LOG_DIR: "custom-logs",
      EXISTING: "from-process",
    });
  });

  it("sets the default log directory when .env does not provide one", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ps-bridge-main-"));

    const result = await executeMainEntry(dir);

    expect(result.bundleEnv.PS_BRIDGE_LOG_DIR).toBe(path.join(dir, "logs"));
  });
});
