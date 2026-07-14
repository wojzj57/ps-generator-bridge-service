import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cliArgs";

describe("setup-generator-settings arguments", () => {
  it.each(["--pref", "-pref"])("accepts the %s path option", (option) => {
    const parsed = parseArgs([
      "setup-generator-settings",
      option,
      "MachinePrefs.psp",
      "--password",
      "custom12",
    ]);

    expect(parsed.command).toBe("setup-generator-settings");
    expect(parsed.options.pref).toBe("MachinePrefs.psp");
    expect(parsed.options.password).toBe("custom12");
  });

  it("requires a preferences path", () => {
    expect(() => parseArgs(["setup-generator-settings"])).toThrow("requires --pref or -pref");
  });

  it("rejects duplicate path aliases and passwords", () => {
    expect(() =>
      parseArgs([
        "setup-generator-settings",
        "--pref",
        "MachinePrefs.psp",
        "-pref",
        "MachinePrefs.psp",
      ])
    ).toThrow("must not be provided more than once");
    expect(() =>
      parseArgs([
        "setup-generator-settings",
        "--pref",
        "MachinePrefs.psp",
        "--password",
        "custom12",
        "--password",
        "custom34",
      ])
    ).toThrow("must not be provided more than once");
  });

  it("rejects unsupported and equals-style options", () => {
    expect(() => parseArgs(["setup-generator-settings", "--pref=MachinePrefs.psp"])).toThrow(
      "Unknown option"
    );
    expect(() =>
      parseArgs(["setup-generator-settings", "--pref", "MachinePrefs.psp", "--yes"])
    ).toThrow("only accepts --pref");
  });
});

describe("password arguments on existing commands", () => {
  it.each([
    ["setup-photoshop", ["--version", "2025"]],
    ["run", ["--plugin", "plugin"]],
    ["dev", ["--plugins-dir", "plugins"]],
  ] as const)("allows --password for %s", (command, requiredArgs) => {
    const parsed = parseArgs([command, ...requiredArgs, "--password", "custom12"]);

    expect(parsed.options.password).toBe("custom12");
  });

  it("rejects --password for unrelated setup commands", () => {
    expect(() => parseArgs(["setup", "--password", "custom12"])).toThrow(
      "setup only accepts --dir"
    );
    expect(() => parseArgs(["setup-core", "--password", "custom12"])).toThrow(
      "setup-core only accepts --update"
    );
  });
});

describe("run and dev plugin sources", () => {
  it.each([
    ["--plugin", "plugin"],
    ["--plugins-dir", "plugins"],
  ])("accepts %s with a path", (option, value) => {
    const parsed = parseArgs(["run", option, value]);

    expect(parsed.command).toBe("run");
  });

  it("treats --plugin-cwd as a value-less plugin source", () => {
    const parsed = parseArgs(["dev", "--plugin-cwd"]);

    expect(parsed.options.pluginCwd).toBe(true);
  });

  it("requires exactly one plugin source", () => {
    expect(() => parseArgs(["run"])).toThrow("Exactly one of");
    expect(() => parseArgs(["run", "--plugin-cwd", "--plugins-dir", "plugins"])).toThrow(
      "Exactly one of"
    );
  });

  it("rejects the removed --expect-plugin option", () => {
    expect(() => parseArgs(["run", "--plugin-cwd", "--expect-plugin", "legacy"])).toThrow(
      "Unknown option: --expect-plugin"
    );
  });
});

describe("runtime version arguments", () => {
  it.each([
    ["setup", []],
    ["setup-photoshop", ["--version", "2025"]],
    ["run", ["--plugin-cwd"]],
    ["dev", ["--plugins-dir", "plugins"]],
  ] as const)("accepts --runtime-version for %s", (command, requiredArgs) => {
    const parsed = parseArgs([command, ...requiredArgs, "--runtime-version", "0.6.0"]);

    expect(parsed.options.runtimeVersion).toBe("0.6.0");
  });

  it("rejects runtime versions for unrelated commands", () => {
    expect(() => parseArgs(["setup-core", "--runtime-version", "latest"])).toThrow(
      "setup-core only accepts --update"
    );
    expect(() =>
      parseArgs([
        "setup-generator-settings",
        "--pref",
        "MachinePrefs.psp",
        "--runtime-version",
        "latest",
      ])
    ).toThrow("only accepts --pref");
  });
});
