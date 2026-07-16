import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PathEnvironment } from "../src/appPaths";
import type { ResolvedRuntimeRelease, RuntimeReleaseClient } from "../src/githubRelease";
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
  it("installs the resolved latest release once and checks GitHub on every invocation", () => {
    const paths = newPaths();
    let installs = 0;
    const releaseClient = fakeReleaseClient("1.2.3", (packageDir, version) => {
      installs += 1;
      writeRuntime(packageDir, version);
    });

    expect(ensureGeneratorRuntime({ ...paths, releaseClient }).version).toBe("1.2.3");
    expect(ensureGeneratorRuntime({ ...paths, releaseClient }).version).toBe("1.2.3");
    expect(releaseClient.resolve).toHaveBeenCalledTimes(2);
    expect(installs).toBe(1);
    expect(inspectRuntimeCache(paths)?.version).toBe("1.2.3");
  });

  it("updates the cache when the latest GitHub Release changes", () => {
    const paths = newPaths();
    const first = fakeReleaseClient("1.0.0", (packageDir, version) =>
      writeRuntime(packageDir, version)
    );
    const second = fakeReleaseClient("2.0.0", (packageDir, version) =>
      writeRuntime(packageDir, version)
    );

    ensureGeneratorRuntime({ ...paths, releaseClient: first });
    const updated = ensureGeneratorRuntime({ ...paths, releaseClient: second });

    expect(updated.version).toBe("2.0.0");
    expect(inspectRuntimeCache(paths)?.version).toBe("2.0.0");
  });

  it("falls back to a valid cache when latest cannot be checked or installed", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });
    const warn = vi.fn();

    const offline = ensureGeneratorRuntime({
      ...paths,
      releaseClient: {
        resolve: vi.fn(() => {
          throw new Error("offline");
        }),
        install: vi.fn(),
      },
      warn,
    });
    const failedUpdate = ensureGeneratorRuntime({
      ...paths,
      releaseClient: fakeReleaseClient("2.0.0", () => {
        throw new Error("download failed");
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
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });

    expect(() =>
      ensureGeneratorRuntime({
        ...paths,
        version: "2.0.0",
        releaseClient: fakeReleaseClient("2.0.0", () => {
          throw new Error("download failed");
        }),
      })
    ).toThrow("Failed to install generator runtime 2.0.0");
    expect(inspectRuntimeCache(paths)?.version).toBe("1.0.0");
  });

  it("reuses an exact matching cache without contacting GitHub", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      version: "1.0.0",
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });
    const offlineClient: RuntimeReleaseClient = {
      resolve: vi.fn(() => {
        throw new Error("offline");
      }),
      install: vi.fn(),
    };

    expect(
      ensureGeneratorRuntime({
        ...paths,
        version: "1.0.0",
        releaseClient: offlineClient,
      }).version
    ).toBe("1.0.0");
    expect(offlineClient.resolve).not.toHaveBeenCalled();
    expect(offlineClient.install).not.toHaveBeenCalled();
  });

  it("rejects dist-tags, unsafe selectors, build metadata, and non-Windows runtime setup", () => {
    const paths = newPaths();
    const releaseClient = fakeReleaseClient("1.0.0", vi.fn());

    for (const version of ["next", "latest & whoami", "1.0.0+build.1"]) {
      expect(() => ensureGeneratorRuntime({ ...paths, version, releaseClient })).toThrow(
        "use latest or an exact semver"
      );
    }
    expect(() =>
      ensureGeneratorRuntime({
        ...paths,
        releaseClient,
        runtimePlatform: "linux",
      })
    ).toThrow("only supports Windows");
  });

  it("rejects a downloaded package whose version differs from the release", () => {
    const paths = newPaths();
    const releaseClient = fakeReleaseClient("2.0.0", (packageDir) =>
      writeRuntime(packageDir, "1.0.0")
    );

    expect(() => ensureGeneratorRuntime({ ...paths, releaseClient })).toThrow(
      `Downloaded package is not ${GENERATOR_PACKAGE}@2.0.0`
    );
    expect(inspectRuntimeCache(paths)).toBeUndefined();
  });

  it("preserves the previous cache when replacement validation fails", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      version: "1.0.0",
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });

    expect(() =>
      ensureGeneratorRuntime({
        ...paths,
        version: "2.0.0",
        releaseClient: fakeReleaseClient("2.0.0", (packageDir) =>
          writeRuntime(packageDir, "wrong")
        ),
      })
    ).toThrow("Failed to install generator runtime 2.0.0");
    expect(inspectRuntimeCache(paths)?.version).toBe("1.0.0");
  });

  it("continues to accept an existing npm-shaped cache without payload-layout coupling", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });
    const cached = inspectRuntimeCache(paths);
    expect(cached).toBeDefined();
    writeFileSync(
      join(cached?.packageDir as string, "package.json"),
      JSON.stringify({
        name: GENERATOR_PACKAGE,
        version: "1.0.0",
        main: "main.js",
        dependencies: { fastify: "4.29.1" },
      })
    );

    expect(inspectRuntimeCache(paths)?.version).toBe("1.0.0");
  });

  it("rejects a cached package that cannot be loaded", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });
    const cached = inspectRuntimeCache(paths);
    expect(cached).toBeDefined();
    rmSync(join(cached?.packageDir as string, "main.js"), { force: true });

    expect(inspectRuntimeCache(paths)).toBeUndefined();
  });

  it("rejects a cached package with an invalid version or an entry point outside the package", () => {
    const paths = newPaths();
    ensureGeneratorRuntime({
      ...paths,
      releaseClient: fakeReleaseClient("1.0.0", (packageDir, version) =>
        writeRuntime(packageDir, version)
      ),
    });
    const cached = inspectRuntimeCache(paths);
    expect(cached).toBeDefined();
    const manifestPath = join(cached?.packageDir as string, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

    writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: "not-semver" }));
    expect(inspectRuntimeCache(paths)).toBeUndefined();

    const outsideEntry = join(paths.home as string, "outside.js");
    writeFileSync(outsideEntry, "module.exports = {};\n");
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, version: "1.0.0", main: outsideEntry })
    );
    expect(inspectRuntimeCache(paths)).toBeUndefined();
  });
});

function newPaths(): PathEnvironment & { runtimePlatform: NodeJS.Platform } {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-runtime-"));
  roots.push(root);
  return {
    platform: process.platform,
    runtimePlatform: "win32",
    env: { LOCALAPPDATA: root, XDG_CACHE_HOME: root },
    home: root,
  };
}

function fakeReleaseClient(
  latestVersion: string,
  install: (packageDir: string, version: string) => void
): RuntimeReleaseClient & { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn((requested: string) => {
      const version = requested === "latest" ? latestVersion : requested;
      return { version, assetUrl: `https://example.test/${version}/ps-generator-bridge.zip` };
    }),
    install: vi.fn((release, packageDir) => install(packageDir, release.version)),
  };
}

function writeRuntime(packageDir: string, version: string): void {
  mkdirSync(join(packageDir, "dist"), { recursive: true });
  mkdirSync(join(packageDir, "jsx"), { recursive: true });
  mkdirSync(join(packageDir, "native"), { recursive: true });
  writeFileSync(join(packageDir, "main.js"), "module.exports = {};\n");
  writeFileSync(join(packageDir, "native", "sharp-win32-x64.node"), "native");
  writeFileSync(join(packageDir, "native", "libvips-42.dll"), "native");
  writeFileSync(join(packageDir, "native", "versions.json"), "{}");
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({
      name: GENERATOR_PACKAGE,
      version,
      main: "main.js",
      os: ["win32"],
      cpu: ["x64"],
      "generator-core-version": ">=1.0.0",
    })
  );
}
