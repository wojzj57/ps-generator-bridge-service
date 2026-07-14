import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireOperationLock } from "../src/operationLock";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("shared operation lock", () => {
  it("rejects a second live owner and permits access after release", () => {
    const lockPath = newLockPath();
    const first = acquireOperationLock({
      lockPath,
      pid: 101,
      command: "dev",
      isPidRunning: (pid) => pid === 101,
    });

    expect(() =>
      acquireOperationLock({
        lockPath,
        pid: 202,
        command: "run",
        isPidRunning: (pid) => pid === 101,
      })
    ).toThrow("cache is in use by PID 101 (dev)");

    first.release();
    const second = acquireOperationLock({
      lockPath,
      pid: 202,
      command: "run",
      isPidRunning: () => false,
    });
    second.release();
  });

  it("reclaims a stale lock", () => {
    const lockPath = newLockPath();
    acquireOperationLock({
      lockPath,
      pid: 101,
      command: "crashed",
      isPidRunning: () => false,
    });

    const replacement = acquireOperationLock({
      lockPath,
      pid: 202,
      command: "run",
      isPidRunning: () => false,
    });

    replacement.release();
  });
});

function newLockPath(): string {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-lock-"));
  roots.push(root);
  return join(root, "app", ".operation.lock");
}
