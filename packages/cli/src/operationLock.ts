import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { ensureManagedAppRoot, operationLockPath, type PathEnvironment } from "./appPaths";

interface LockRecord {
  pid: number;
  command: string;
  createdAt: string;
}

export interface OperationLockOptions extends PathEnvironment {
  command?: string;
  lockPath?: string;
  pid?: number;
  isPidRunning?: (pid: number) => boolean;
}

export interface OperationLock {
  path: string;
  release(): void;
}

export function acquireOperationLock(options: OperationLockOptions = {}): OperationLock {
  if (!options.lockPath) ensureManagedAppRoot(options);
  const path = options.lockPath ?? operationLockPath(options);
  const pid = options.pid ?? process.pid;
  const isPidRunning = options.isPidRunning ?? defaultIsPidRunning;
  mkdirSync(dirname(path), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, "wx");
      const record: LockRecord = {
        pid,
        command: options.command ?? (process.argv.slice(2).join(" ") || "unknown"),
        createdAt: new Date().toISOString(),
      };
      try {
        writeFileSync(fd, `${JSON.stringify(record)}\n`);
      } finally {
        closeSync(fd);
      }
      let released = false;
      return {
        path,
        release() {
          if (released) return;
          released = true;
          const current = readLock(path);
          if (current?.pid === pid) rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const current = readLock(path);
      if (current && isPidRunning(current.pid)) {
        throw new Error(
          `PS Generator Bridge cache is in use by PID ${current.pid} (${current.command}). Wait for that command to finish.`
        );
      }
      rmSync(path, { force: true });
    }
  }

  throw new Error(`Unable to acquire PS Generator Bridge cache lock: ${path}`);
}

export async function withOperationLock<T>(
  body: () => Promise<T> | T,
  options: OperationLockOptions = {}
): Promise<T> {
  const lock = acquireOperationLock(options);
  try {
    return await body();
  } finally {
    lock.release();
  }
}

function readLock(path: string): LockRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LockRecord>;
    if (!Number.isInteger(parsed.pid) || typeof parsed.command !== "string") return undefined;
    return parsed as LockRecord;
  } catch {
    return undefined;
  }
}

function defaultIsPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}
