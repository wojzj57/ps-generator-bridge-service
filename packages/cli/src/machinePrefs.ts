import { pbkdf2Sync, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DEFAULT_REMOTE_PASSWORD, validateRemotePassword } from "./remotePassword";

const FILE_SIGNATURE = "8BPF";
const FILE_VERSION = 1;
const DESCRIPTOR_VERSION = 16;
const PASSWORD_SALT = "Adobe Photoshop";
const PASSWORD_ITERATIONS = 1000;
const PASSWORD_KEY_LENGTH = 24;
const PASSWORD_DIGEST = "sha1";
const MAX_DEPTH = 64;
const MAX_ITEMS = 1_000_000;

interface DescriptorEntry {
  key: string;
  type: string;
  valueOffset: number;
  dataOffset?: number;
  dataLength?: number;
}

export interface MachinePrefsPatchResult {
  data: Buffer;
  changedKeys: string[];
}

export interface MachinePrefsUpdateResult {
  changedKeys: string[];
}

export function patchMachinePrefs(
  source: Buffer,
  password = DEFAULT_REMOTE_PASSWORD
): MachinePrefsPatchResult {
  validateRemotePassword(password);

  const data = Buffer.from(source);
  const entries = parseMachinePrefs(data);
  const generatorEnabled = requireEntry(entries, "generatorEnabled", "bool");
  const remoteConnectionsEnabled = requireEntry(entries, "srvE", "bool");
  const remotePassword = requireEntry(entries, "srvK", "tdta");

  if (
    remotePassword.dataOffset === undefined ||
    remotePassword.dataLength !== PASSWORD_KEY_LENGTH
  ) {
    throw new Error(
      `MachinePrefs.psp entry 'srvK' must contain exactly ${PASSWORD_KEY_LENGTH} bytes.`
    );
  }

  const changedKeys: string[] = [];
  setBoolean(data, generatorEnabled, "generatorEnabled", changedKeys);
  setBoolean(data, remoteConnectionsEnabled, "srvE", changedKeys);

  const passwordKey = derivePhotoshopPasswordKey(password);
  const existingPasswordKey = data.subarray(
    remotePassword.dataOffset,
    remotePassword.dataOffset + remotePassword.dataLength
  );
  if (!existingPasswordKey.equals(passwordKey)) {
    passwordKey.copy(data, remotePassword.dataOffset);
    changedKeys.push("srvK");
  }

  const verifiedEntries = parseMachinePrefs(data);
  verifyBoolean(verifiedEntries, data, "generatorEnabled");
  verifyBoolean(verifiedEntries, data, "srvE");
  const verifiedPassword = requireEntry(verifiedEntries, "srvK", "tdta");
  if (
    verifiedPassword.dataOffset === undefined ||
    verifiedPassword.dataLength !== passwordKey.length ||
    !data
      .subarray(
        verifiedPassword.dataOffset,
        verifiedPassword.dataOffset + verifiedPassword.dataLength
      )
      .equals(passwordKey)
  ) {
    throw new Error("MachinePrefs.psp password verification failed after patching.");
  }

  return { data, changedKeys };
}

export function updateMachinePrefsFile(
  path: string,
  password = DEFAULT_REMOTE_PASSWORD
): MachinePrefsUpdateResult {
  const targetPath = resolveMachinePrefsPath(path);

  const source = readFileSync(targetPath);
  const result = patchMachinePrefs(source, password);
  if (result.changedKeys.length === 0) return { changedKeys: [] };

  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`
  );

  try {
    writeFileSync(tempPath, result.data, { mode: statSync(targetPath).mode });
    const descriptor = openSync(tempPath, "r+");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }

  return { changedKeys: result.changedKeys };
}

export function derivePhotoshopPasswordKey(password: string): Buffer {
  validateRemotePassword(password);
  return pbkdf2Sync(
    password,
    PASSWORD_SALT,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  );
}

export function resolveMachinePrefsPath(
  path: string,
  cwd = process.cwd(),
  inspect: typeof lstatSync = lstatSync
): string {
  const targetPath = resolve(cwd, path);
  if (basename(targetPath).toLowerCase() !== "machineprefs.psp") {
    throw new Error("Photoshop preferences path must point to a file named MachinePrefs.psp.");
  }

  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = inspect(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Photoshop settings do not exist: ${targetPath}`);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Photoshop settings path must not be a symbolic link: ${targetPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Photoshop settings path must be a regular file: ${targetPath}`);
  }
  return targetPath;
}

function parseMachinePrefs(data: Buffer): DescriptorEntry[] {
  const reader = new DescriptorReader(data);
  if (reader.readAscii(4) !== FILE_SIGNATURE) {
    throw new Error("MachinePrefs.psp has an invalid 8BPF signature.");
  }
  if (reader.readUInt16() !== FILE_VERSION) {
    throw new Error(`MachinePrefs.psp file version ${FILE_VERSION} is required.`);
  }
  if (reader.readUInt32() !== DESCRIPTOR_VERSION) {
    throw new Error(`MachinePrefs.psp descriptor version ${DESCRIPTOR_VERSION} is required.`);
  }

  const entries = reader.readDescriptor(0, true);
  if (!reader.atEnd()) {
    throw new Error(
      `MachinePrefs.psp contains unsupported trailing data at offset ${reader.offset}.`
    );
  }
  return entries;
}

class DescriptorReader {
  offset = 0;

  constructor(private readonly data: Buffer) {}

  atEnd(): boolean {
    return this.offset === this.data.length;
  }

  readAscii(length: number): string {
    this.ensureAvailable(length);
    const value = this.data.toString("latin1", this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readUInt16(): number {
    this.ensureAvailable(2);
    const value = this.data.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readUInt32(): number {
    this.ensureAvailable(4);
    const value = this.data.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readDescriptor(depth: number, collectEntries: boolean): DescriptorEntry[] {
    this.ensureDepth(depth);
    this.skipUnicodeString();
    this.readId();
    const count = this.readCount();
    const entries: DescriptorEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const key = this.readId();
      const type = this.readAscii(4);
      const entry = this.readValue(type, depth);
      if (collectEntries) entries.push({ key, type, ...entry });
    }
    return entries;
  }

  private readValue(
    type: string,
    depth: number
  ): Pick<DescriptorEntry, "valueOffset" | "dataOffset" | "dataLength"> {
    const valueOffset = this.offset;
    switch (type) {
      case "bool":
        this.skip(1);
        return { valueOffset };
      case "long":
        this.skip(4);
        return { valueOffset };
      case "comp":
        this.skip(8);
        return { valueOffset };
      case "TEXT":
        this.skipUnicodeString();
        return { valueOffset };
      case "enum":
        this.readId();
        this.readId();
        return { valueOffset };
      case "Objc":
        this.readDescriptor(depth + 1, false);
        return { valueOffset };
      case "VlLs":
        this.readList(depth + 1);
        return { valueOffset };
      case "Pth ":
      case "tdta": {
        const dataLength = this.readUInt32();
        const dataOffset = this.offset;
        this.skip(dataLength);
        return { valueOffset, dataOffset, dataLength };
      }
      default:
        throw new Error(
          `MachinePrefs.psp contains unsupported descriptor type '${type}' at offset ${valueOffset - 4}.`
        );
    }
  }

  private readList(depth: number): void {
    this.ensureDepth(depth);
    const count = this.readCount();
    for (let index = 0; index < count; index += 1) {
      const type = this.readAscii(4);
      this.readValue(type, depth);
    }
  }

  private readId(): string {
    const length = this.readUInt32();
    return this.readAscii(length === 0 ? 4 : length);
  }

  private skipUnicodeString(): void {
    const characters = this.readUInt32();
    if (characters > Math.floor((this.data.length - this.offset) / 2)) {
      throw new Error(
        `MachinePrefs.psp has an invalid Unicode string at offset ${this.offset - 4}.`
      );
    }
    this.skip(characters * 2);
  }

  private readCount(): number {
    const count = this.readUInt32();
    if (count > MAX_ITEMS) {
      throw new Error(`MachinePrefs.psp contains too many descriptor items: ${count}.`);
    }
    return count;
  }

  private ensureDepth(depth: number): void {
    if (depth > MAX_DEPTH) {
      throw new Error(`MachinePrefs.psp descriptor nesting exceeds ${MAX_DEPTH} levels.`);
    }
  }

  private skip(length: number): void {
    this.ensureAvailable(length);
    this.offset += length;
  }

  private ensureAvailable(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw new Error(`MachinePrefs.psp is truncated or corrupt at offset ${this.offset}.`);
    }
  }
}

function requireEntry(entries: DescriptorEntry[], key: string, type: string): DescriptorEntry {
  const matches = entries.filter((entry) => entry.key === key);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `MachinePrefs.psp entry '${key}' was not found.`
        : `MachinePrefs.psp contains duplicate '${key}' entries.`
    );
  }
  const entry = matches[0] as DescriptorEntry;
  if (entry.type !== type) {
    throw new Error(
      `MachinePrefs.psp entry '${key}' must have type '${type}', not '${entry.type}'.`
    );
  }
  return entry;
}

function setBoolean(
  data: Buffer,
  entry: DescriptorEntry,
  key: string,
  changedKeys: string[]
): void {
  const value = data[entry.valueOffset];
  if (value !== 0 && value !== 1) {
    throw new Error(`MachinePrefs.psp entry '${key}' has an invalid boolean value.`);
  }
  if (value === 0) {
    data[entry.valueOffset] = 1;
    changedKeys.push(key);
  }
}

function verifyBoolean(entries: DescriptorEntry[], data: Buffer, key: string): void {
  const entry = requireEntry(entries, key, "bool");
  if (data[entry.valueOffset] !== 1) {
    throw new Error(`MachinePrefs.psp entry '${key}' verification failed after patching.`);
  }
}
