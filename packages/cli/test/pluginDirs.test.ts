import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { PLUGINS_MARKER, pluginsSnapshotDir, type PathEnvironment } from "../src/appPaths";
import {
  cleanupPluginSource,
  countPluginCandidates,
  parsePluginPaths,
  preparePluginSource,
  scanPluginCandidates,
} from "../src/pluginDirs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("plugin source preparation", () => {
  it("creates a managed one-plugin snapshot and removes its link on cleanup", async () => {
    const { root, paths } = newRoot();
    const plugin = writePlugin(join(root, "source", "my plugin"));

    const source = await preparePluginSource({ plugin }, paths);

    expect(source.pluginsDir).toBe(pluginsSnapshotDir(paths));
    expect(source.linkPath).toBeDefined();
    expect(realpathSync(source.linkPath as string)).toBe(realpathSync(plugin));
    expect(scanPluginCandidates(source.pluginsDir)).toEqual(["my_plugin"]);
    expect(readFileSync(join(source.pluginsDir, PLUGINS_MARKER), "utf8")).toContain(
      "plugins snapshot"
    );

    await cleanupPluginSource(source);
    expect(existsSync(source.linkPath as string)).toBe(false);
  });

  it("uses the current working directory for --plugin-cwd", async () => {
    const { root, paths } = newRoot();
    const plugin = writePlugin(join(root, "cwd-plugin"));
    const previous = process.cwd();
    process.chdir(plugin);
    try {
      const source = await preparePluginSource({ pluginCwd: true }, paths);
      expect(realpathSync(source.linkPath as string)).toBe(realpathSync(plugin));
      await cleanupPluginSource(source);
    } finally {
      process.chdir(previous);
    }
  });

  it("passes --plugins-dir through without creating a snapshot", async () => {
    const { root, paths } = newRoot();
    const pluginsDir = join(root, "external-plugins");
    mkdirSync(pluginsDir, { recursive: true });

    const source = await preparePluginSource({ pluginsDir }, paths);

    expect(source).toEqual({ pluginsDir: realpathSync(pluginsDir) });
    expect(existsSync(pluginsSnapshotDir(paths))).toBe(false);
  });

  it("refuses an unmarked non-empty snapshot directory", async () => {
    const { root, paths } = newRoot();
    const plugin = writePlugin(join(root, "source", "plugin"));
    const snapshot = pluginsSnapshotDir(paths);
    mkdirSync(snapshot, { recursive: true });
    writeFileSync(join(snapshot, "keep.txt"), "user data");

    await expect(preparePluginSource({ plugin }, paths)).rejects.toThrow("not managed by the CLI");
    expect(readFileSync(join(snapshot, "keep.txt"), "utf8")).toBe("user data");
  });

  it("rejects plugin sources inside the managed snapshot before cleaning it", async () => {
    const { paths } = newRoot();
    const snapshot = pluginsSnapshotDir(paths);
    const plugin = writePlugin(join(snapshot, "source"));

    await expect(preparePluginSource({ plugin }, paths)).rejects.toThrow("must not point inside");
    expect(existsSync(join(plugin, "package.json"))).toBe(true);
  });

  it("parses inherited explicit plugin paths using the platform delimiter", () => {
    const first = join(tmpdir(), "plugin one");
    const second = join(tmpdir(), "plugin-two");

    expect(parsePluginPaths(` ${first}${delimiter}${delimiter}${second} `)).toEqual([
      first,
      second,
    ]);
  });

  it("counts distinct explicit and collection candidates by real path", () => {
    const { root } = newRoot();
    const explicitPlugin = writePlugin(join(root, "explicit"));
    const pluginsDir = join(root, "collection");
    mkdirSync(pluginsDir, { recursive: true });
    symlinkSync(
      explicitPlugin,
      join(pluginsDir, "same-plugin"),
      process.platform === "win32" ? "junction" : "dir"
    );
    writePlugin(join(pluginsDir, "base-plugin"));

    expect(countPluginCandidates(pluginsDir, [explicitPlugin, join(explicitPlugin, ".")])).toBe(2);
  });

  it("counts an invalid declared explicit path so smoke validation can fail", () => {
    const { root } = newRoot();
    const pluginsDir = join(root, "collection");
    mkdirSync(pluginsDir, { recursive: true });
    const missing = join(root, "missing");

    expect(countPluginCandidates(pluginsDir, [missing, missing])).toBe(1);
  });

  it("does not deduplicate a rejected relative explicit path against the collection", () => {
    const { root } = newRoot();
    const pluginsDir = join(root, "collection");
    writePlugin(join(pluginsDir, "base-plugin"));
    const previous = process.cwd();
    process.chdir(root);

    try {
      expect(countPluginCandidates(pluginsDir, [join("collection", "base-plugin")])).toBe(2);
    } finally {
      process.chdir(previous);
    }
  });
});

function newRoot(): { root: string; paths: PathEnvironment } {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-plugins-"));
  roots.push(root);
  return {
    root,
    paths: {
      platform: process.platform,
      env: { LOCALAPPDATA: root, XDG_CACHE_HOME: root },
      home: root,
    },
  };
}

function writePlugin(path: string): string {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "package.json"), JSON.stringify({ name: "test-plugin" }));
  return path;
}
