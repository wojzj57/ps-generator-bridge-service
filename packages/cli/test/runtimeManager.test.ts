import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PathEnvironment } from "../src/appPaths";
import type { NpmClient } from "../src/npm";
import {
  ensureGeneratorRuntime,
  GENERATOR_PACKAGE,
  inspectRuntimeCache,
} from "../src/runtimeManager";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("generator runtime cache", () => {
  it("installs the resolved latest version once and reuses the valid cache", () => {
    const paths = newPaths();
    let installs = 0;
    const npm = fakeNpm("1.2.3", (cwd, version) => {
      installs += 1;
      writeRuntime(cwd, version);
    });

    expect(ensureGeneratorRuntime({ ...paths, npm }).version).toBe("1.2.3");
    expect(ensureGeneratorRuntime({ ...paths, npm }).version).toBe("1.2.3");
    expect(installs).toBe(1);
    expect(inspectRuntimeCache(paths)?.version).toBe("1.2.3");
  });

  it("updates the cache when npm latest changes", () => {
    const paths = newPaths();
    const first = fakeNpm("1.0.0", (cwd, version) => writeRuntime(cwd, version));
    const second = fakeNpm("2.0.0", (cwd, version) => writeRuntime(cwd, version));

    ensureGeneratorRuntime({ ...paths, npm: first });
    const updated = ensureGeneratorRuntime({ ...paths, npm: second });

    expect(updated.version).toBe("2.0.0");
    expect(inspectRuntimeCache(paths)?.version).toBe("2.0.0");
  });

  it("falls back to a valid cache when latest cannot be checked or installed", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      npm: fakeNpm("1.0.0", (cwd, version) => writeRuntime(cwd, version)),
    });
    const warn = vi.fn();

    const offline = ensureGeneratorRuntime({
      ...paths,
      npm: {
        viewVersion: () => {
          throw new Error("offline");
        },
        install: vi.fn(),
      },
      warn,
    });
    const failedUpdate = ensureGeneratorRuntime({
      ...paths,
      npm: fakeNpm("2.0.0", () => {
        throw new Error("install failed");
      }),
      warn,
    });

    expect(offline.version).toBe("1.0.0");
    expect(failedUpdate.version).toBe("1.0.0");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not substitute a different cached version for an explicit version", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      npm: fakeNpm("1.0.0", (cwd, version) => writeRuntime(cwd, version)),
    });

    expect(() =>
      ensureGeneratorRuntime({
        ...paths,
        version: "2.0.0",
        npm: fakeNpm("2.0.0", () => {
          throw new Error("install failed");
        }),
      })
    ).toThrow("Failed to install generator runtime 2.0.0");
    expect(inspectRuntimeCache(paths)?.version).toBe("1.0.0");
  });

  it("rejects unsafe version selectors and invalid registry versions", () => {
    const paths = newPaths();

    expect(() =>
      ensureGeneratorRuntime({
        ...paths,
        version: "latest & whoami",
        npm: fakeNpm("1.0.0", vi.fn()),
      })
    ).toThrow("Invalid generator runtime version or tag");
    expect(() => ensureGeneratorRuntime({ ...paths, npm: fakeNpm("not-semver", vi.fn()) })).toThrow(
      "npm returned an invalid generator runtime version"
    );
  });

  it("rejects a cache whose declared runtime dependencies are missing", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      npm: fakeNpm("1.0.0", (cwd, version) => writeRuntime(cwd, version)),
    });
    const cached = inspectRuntimeCache(paths);
    expect(cached).toBeDefined();
    writeFileSync(
      join(cached?.packageDir as string, "package.json"),
      JSON.stringify({
        name: GENERATOR_PACKAGE,
        version: "1.0.0",
        main: "main.js",
        "generator-core-version": ">=1.0.0",
        dependencies: { "missing-runtime-dependency": "1.0.0" },
      })
    );

    expect(inspectRuntimeCache(paths)).toBeUndefined();
  });
});

function newPaths(): PathEnvironment {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-runtime-"));
  roots.push(root);
  return {
    platform: process.platform,
    env: { LOCALAPPDATA: root, XDG_CACHE_HOME: root },
    home: root,
  };
}

function fakeNpm(version: string, install: (cwd: string, version: string) => void): NpmClient {
  return {
    viewVersion: vi.fn(() => version),
    install: vi.fn((args, cwd) => install(cwd, versionFromInstallArgs(args))),
  };
}

function versionFromInstallArgs(args: string[]): string {
  const spec = args.find((arg) => arg.startsWith(`${GENERATOR_PACKAGE}@`));
  if (!spec) throw new Error("missing generator package spec");
  return spec.slice(`${GENERATOR_PACKAGE}@`.length);
}

function writeRuntime(runtimeRoot: string, version: string): void {
  const packageDir = join(runtimeRoot, "node_modules", "@ps-generator-bridge", "generator");
  mkdirSync(join(packageDir, "dist"), { recursive: true });
  mkdirSync(join(packageDir, "jsx"), { recursive: true });
  writeFileSync(join(packageDir, "main.js"), "module.exports = {};\n");
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({
      name: GENERATOR_PACKAGE,
      version,
      main: "main.js",
      "generator-core-version": ">=1.0.0",
    })
  );
}
