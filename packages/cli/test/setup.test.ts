import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectRuntimeTarget, prepareRuntimeTarget } from "../src/setup";
import { confirmRuntimeReplacement } from "../src/setupPhotoshop";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function newTarget(): string {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-cli-"));
  roots.push(root);
  return join(root, "generator-bridge");
}

function write(path: string, content = "content"): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

describe("prepareRuntimeTarget", () => {
  it("preserves user data while clearing installer-managed entries", () => {
    const target = newTarget();
    write(join(target, "package.json"), JSON.stringify({ name: "@ps-generator-bridge/generator" }));
    write(join(target, ".env"), "PS_BRIDGE_PORT=8800");
    write(join(target, "logs", "bridge.log"));
    write(join(target, "plugins", "custom", "index.js"));
    write(join(target, "dist", "old.js"));
    write(join(target, "jsx", "old.jsx"));
    write(join(target, "node_modules", "old-package", "index.js"));
    write(join(target, "main.js"));

    expect(inspectRuntimeTarget(target)).toBe("managed");
    prepareRuntimeTarget(target);

    expect(readFileSync(join(target, ".env"), "utf8")).toBe("PS_BRIDGE_PORT=8800");
    expect(existsSync(join(target, "logs", "bridge.log"))).toBe(true);
    expect(existsSync(join(target, "plugins", "custom", "index.js"))).toBe(true);
    expect(existsSync(join(target, "dist"))).toBe(false);
    expect(existsSync(join(target, "jsx"))).toBe(false);
    expect(existsSync(join(target, "node_modules"))).toBe(false);
    expect(existsSync(join(target, "main.js"))).toBe(false);
    expect(existsSync(join(target, "package.json"))).toBe(true);
  });

  it("refuses to replace an unmanaged non-empty directory by default", () => {
    const target = newTarget();
    write(join(target, "keep.txt"), "keep");

    expect(inspectRuntimeTarget(target)).toBe("unmanaged");
    expect(() => prepareRuntimeTarget(target)).toThrow(/Refusing to overwrite/);
    expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("keep");
  });

  it("replaces an unmanaged directory only after explicit authorization", () => {
    const target = newTarget();
    write(join(target, "remove.txt"));

    prepareRuntimeTarget(target, true);

    expect(existsSync(target)).toBe(true);
    expect(existsSync(join(target, "remove.txt"))).toBe(false);
    expect(inspectRuntimeTarget(target)).toBe("empty");
  });
});

describe("confirmRuntimeReplacement", () => {
  it("updates a managed runtime without authorizing a directory replacement", async () => {
    const target = newTarget();
    write(join(target, "package.json"), JSON.stringify({ name: "@ps-generator-bridge/generator" }));
    const confirm = vi.fn<() => Promise<boolean>>();

    await expect(confirmRuntimeReplacement(target, false, confirm)).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("cancels replacement when the user rejects an unmanaged target", async () => {
    const target = newTarget();
    write(join(target, "keep.txt"));
    const confirm = vi.fn(async () => false);

    await expect(confirmRuntimeReplacement(target, false, confirm)).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("lets --yes authorize an unmanaged target without prompting", async () => {
    const target = newTarget();
    write(join(target, "remove.txt"));
    const confirm = vi.fn<() => Promise<boolean>>();

    await expect(confirmRuntimeReplacement(target, true, confirm)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
