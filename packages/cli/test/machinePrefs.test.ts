import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  derivePhotoshopPasswordKey,
  patchMachinePrefs,
  resolveMachinePrefsPath,
  updateMachinePrefsFile,
} from "../src/machinePrefs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("patchMachinePrefs", () => {
  it("enables Generator and Remote Connections and replaces the password key", () => {
    const source = machinePrefsFixture();

    const result = patchMachinePrefs(source, "password");

    expect(result.changedKeys).toEqual(["generatorEnabled", "srvE", "srvK"]);
    expect(result.data.equals(source)).toBe(false);
    expect(source.includes(derivePhotoshopPasswordKey("password"))).toBe(false);
    expect(result.data.includes(derivePhotoshopPasswordKey("password"))).toBe(true);
    expect(patchMachinePrefs(result.data, "password").changedKeys).toEqual([]);
  });

  it("rejects files that do not contain every required top-level entry", () => {
    const source = machinePrefsFixture({ includePassword: false });

    expect(() => patchMachinePrefs(source)).toThrow("entry 'srvK' was not found");
  });

  it("rejects trailing data instead of patching an unknown file layout", () => {
    const source = Buffer.concat([machinePrefsFixture(), Buffer.from([0])]);

    expect(() => patchMachinePrefs(source)).toThrow("unsupported trailing data");
  });
});

describe("updateMachinePrefsFile", () => {
  it("replaces the preferences without creating a backup", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-prefs-"));
    roots.push(root);
    const path = join(root, "MachinePrefs.psp");
    const source = machinePrefsFixture();
    writeFileSync(path, source);

    const result = updateMachinePrefsFile(path);

    expect(result.changedKeys).toEqual(["generatorEnabled", "srvE", "srvK"]);
    expect(readdirSync(root)).toEqual(["MachinePrefs.psp"]);
    expect(patchMachinePrefs(readFileSync(path)).changedKeys).toEqual([]);
  });

  it("does not create a preferences file before Photoshop has created one", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-prefs-"));
    roots.push(root);
    const path = join(root, "MachinePrefs.psp");

    expect(() => updateMachinePrefsFile(path)).toThrow("Photoshop settings do not exist");
    expect(existsSync(path)).toBe(false);
  });
});

describe("resolveMachinePrefsPath", () => {
  it("resolves relative paths and accepts case-insensitive MachinePrefs.psp names", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-prefs-"));
    roots.push(root);
    const path = join(root, "machineprefs.PSP");
    writeFileSync(path, machinePrefsFixture());

    expect(resolveMachinePrefsPath("machineprefs.PSP", root)).toBe(path);
  });

  it("rejects other file names and directories", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-prefs-"));
    roots.push(root);
    writeFileSync(join(root, "Other.psp"), machinePrefsFixture());
    mkdirSync(join(root, "MachinePrefs.psp"));

    expect(() => resolveMachinePrefsPath(join(root, "Other.psp"))).toThrow(
      "must point to a file named MachinePrefs.psp"
    );
    expect(() => resolveMachinePrefsPath(join(root, "MachinePrefs.psp"))).toThrow(
      "must be a regular file"
    );
  });

  it("rejects symbolic links before opening the target", () => {
    const inspect = (() => ({
      isSymbolicLink: () => true,
      isFile: () => true,
    })) as unknown as Parameters<typeof resolveMachinePrefsPath>[2];

    expect(() => resolveMachinePrefsPath("MachinePrefs.psp", "C:\\settings", inspect)).toThrow(
      "must not be a symbolic link"
    );
  });
});

function machinePrefsFixture(options: { includePassword?: boolean } = {}): Buffer {
  const entries = [
    entry("generatorEnabled", "bool", Buffer.from([0])),
    entry("srvE", "bool", Buffer.from([0])),
    ...(options.includePassword === false
      ? []
      : [entry("srvK", "tdta", lengthPrefixed(Buffer.alloc(24)))]),
    entry("textValue", "TEXT", unicodeValue("fixture")),
    entry("longValue", "long", uint32(42)),
    entry("largeValue", "comp", Buffer.alloc(8)),
    entry("enumValue", "enum", Buffer.concat([id("type"), id("test")])),
    entry("pathValue", "Pth ", lengthPrefixed(Buffer.from("path", "latin1"))),
    entry("nestedValue", "Objc", descriptor([entry("generatorEnabled", "bool", Buffer.from([0]))])),
    entry(
      "listValue",
      "VlLs",
      Buffer.concat([
        uint32(3),
        ascii("bool"),
        Buffer.from([1]),
        ascii("long"),
        uint32(7),
        ascii("TEXT"),
        unicodeValue("list"),
      ])
    ),
  ];

  return Buffer.concat([ascii("8BPF"), uint16(1), uint32(16), descriptor(entries)]);
}

function descriptor(entries: Buffer[]): Buffer {
  return Buffer.concat([unicodeClassName(), id("null"), uint32(entries.length), ...entries]);
}

function entry(key: string, type: string, value: Buffer): Buffer {
  return Buffer.concat([id(key), ascii(type), value]);
}

function id(value: string): Buffer {
  return value.length === 4
    ? Buffer.concat([uint32(0), ascii(value)])
    : Buffer.concat([uint32(value.length), ascii(value)]);
}

function unicodeClassName(): Buffer {
  return Buffer.concat([uint32(1), Buffer.from([0, 0])]);
}

function unicodeValue(value: string): Buffer {
  const encoded = Buffer.alloc(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    encoded.writeUInt16BE(value.charCodeAt(index), index * 2);
  }
  return Buffer.concat([uint32(value.length), encoded]);
}

function lengthPrefixed(value: Buffer): Buffer {
  return Buffer.concat([uint32(value.length), value]);
}

function ascii(value: string): Buffer {
  return Buffer.from(value, "latin1");
}

function uint16(value: number): Buffer {
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
}

function uint32(value: number): Buffer {
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value);
  return result;
}
