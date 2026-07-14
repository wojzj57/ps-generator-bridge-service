import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_MARKER,
  appRoot,
  ensureManagedAppRoot,
  generatorCoreDir,
  generatorRuntimePackageDir,
  pluginsSnapshotDir,
} from "../src/appPaths";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("shared application paths", () => {
  it("uses LOCALAPPDATA on Windows", () => {
    const paths = {
      platform: "win32" as const,
      env: { LOCALAPPDATA: "C:\\Cache" },
      home: "C:\\User",
    };

    expect(appRoot(paths)).toBe("C:\\Cache\\ps-generator-bridge");
    expect(generatorCoreDir(paths)).toBe("C:\\Cache\\ps-generator-bridge\\generator-core");
    expect(pluginsSnapshotDir(paths)).toBe("C:\\Cache\\ps-generator-bridge\\plugins");
  });

  it("falls back to the Windows user profile and uses platform cache roots elsewhere", () => {
    expect(appRoot({ platform: "win32", env: {}, home: "C:\\User" })).toBe(
      "C:\\User\\AppData\\Local\\ps-generator-bridge"
    );
    expect(appRoot({ platform: "darwin", env: {}, home: "/Users/me" })).toBe(
      "/Users/me/Library/Caches/ps-generator-bridge"
    );
    expect(
      appRoot({ platform: "linux", env: { XDG_CACHE_HOME: "/cache" }, home: "/home/me" })
    ).toBe("/cache/ps-generator-bridge");
  });

  it("places the npm-installed runtime package under generator-runtime", () => {
    expect(
      generatorRuntimePackageDir({
        platform: "linux",
        env: { XDG_CACHE_HOME: "/cache" },
        home: "/home/me",
      })
    ).toBe(
      "/cache/ps-generator-bridge/generator-runtime/node_modules/@ps-generator-bridge/generator"
    );
  });

  it("adopts known legacy cache entries but refuses unknown application data", () => {
    const parent = mkdtempSync(join(tmpdir(), "ps-bridge-paths-"));
    roots.push(parent);
    const paths = {
      platform: process.platform,
      env: { LOCALAPPDATA: parent, XDG_CACHE_HOME: parent },
      home: parent,
    };
    const root = appRoot(paths);
    mkdirSync(join(root, "generator-core"), { recursive: true });

    expect(ensureManagedAppRoot(paths)).toBe(root);
    expect(existsSync(join(root, APP_MARKER))).toBe(true);

    rmSync(join(root, APP_MARKER));
    writeFileSync(join(root, "personal.txt"), "keep");
    expect(() => ensureManagedAppRoot(paths)).toThrow("unknown entries");
    expect(existsSync(join(root, "personal.txt"))).toBe(true);

    rmSync(join(root, "personal.txt"));
    writeFileSync(join(root, APP_MARKER), "not-owned-by-this-cli\n");
    expect(() => ensureManagedAppRoot(paths)).toThrow("invalid marker");
  });
});
