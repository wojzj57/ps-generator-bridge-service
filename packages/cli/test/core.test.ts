import { describe, expect, it } from "vitest";
import { generatorCoreArguments, sdkCompatibilityError } from "../src/core";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import {
  assertGeneratorCoreCompatibility,
  cleanManagedCache,
  isGeneratorCoreUsable,
} from "../src/generatorCore";
import { appRoot, ensureManagedAppRoot, type PathEnvironment } from "../src/appPaths";
import type { RuntimeCache } from "../src/runtimeManager";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generatorCoreArguments", () => {
  it("passes the configured Photoshop password to generator-core", () => {
    expect(generatorCoreArguments("app.js", "generator-plugin", "custom12")).toEqual([
      "app.js",
      "-f",
      "generator-plugin",
      "-P",
      "custom12",
    ]);
  });

  it("turns SDK smoke failures into an actionable compatibility error", () => {
    expect(sdkCompatibilityError("2.0.0", new Error("unknown frame")).message).toContain(
      "upgrade @ps-generator-bridge/cli"
    );
  });
});

describe("generator-core cache", () => {
  it("requires the checkout, app, package metadata, and dependencies", () => {
    const dir = newCore("1.2.0");
    expect(isGeneratorCoreUsable(dir)).toBe(true);

    rmSync(join(dir, "node_modules"), { recursive: true });
    expect(isGeneratorCoreUsable(dir)).toBe(false);
  });

  it("checks runtime compatibility against the cached core version", () => {
    const dir = newCore("1.2.0");
    const runtime = {
      name: "@ps-generator-bridge/generator",
      version: "2.0.0",
      packageDir: "runtime",
      "generator-core-version": ">=1.0.0 <2.0.0",
    } satisfies RuntimeCache;

    expect(() => assertGeneratorCoreCompatibility(runtime, dir)).not.toThrow();
    expect(() =>
      assertGeneratorCoreCompatibility({ ...runtime, "generator-core-version": ">=2.0.0" }, dir)
    ).toThrow("run/dev --update-core or setup-core --update");
  });

  it("cleans the marked shared cache and refuses an unmanaged root", () => {
    const paths = newPathEnvironment();
    const managedRoot = ensureManagedAppRoot(paths);
    mkdirSync(join(managedRoot, "generator-runtime"));

    cleanManagedCache(paths);
    expect(existsSync(managedRoot)).toBe(false);

    mkdirSync(appRoot(paths), { recursive: true });
    writeFileSync(join(appRoot(paths), "personal.txt"), "keep");
    expect(() => cleanManagedCache(paths)).toThrow("unmanaged directory");
    expect(existsSync(join(appRoot(paths), "personal.txt"))).toBe(true);
  });
});

function newCore(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ps-bridge-core-"));
  roots.push(dir);
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "app.js"), "");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  return dir;
}

function newPathEnvironment(): PathEnvironment {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-cache-"));
  roots.push(root);
  return {
    platform: process.platform,
    env: { LOCALAPPDATA: root, XDG_CACHE_HOME: root },
    home: root,
  };
}
