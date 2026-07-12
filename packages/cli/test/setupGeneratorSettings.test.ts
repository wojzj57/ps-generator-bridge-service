import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupGeneratorSettings } from "../src/setupGeneratorSettings";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("setupGeneratorSettings", () => {
  it("resolves the path, checks Photoshop, and passes the resolved password", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-settings-"));
    roots.push(root);
    const path = join(root, "MachinePrefs.psp");
    writeFileSync(path, "fixture");
    const ensurePhotoshopClosed = vi.fn();
    const updatePreferences = vi.fn(() => ({ changedKeys: ["srvK"] }));

    const result = setupGeneratorSettings(
      { pref: "MachinePrefs.psp" },
      {
        platform: "win32",
        cwd: root,
        env: { PS_GENERATOR_REMOTE_PASSWORD: "environment1" },
        ensurePhotoshopClosed,
        updatePreferences,
      }
    );

    expect(ensurePhotoshopClosed).toHaveBeenCalledOnce();
    expect(updatePreferences).toHaveBeenCalledWith(path, "environment1");
    expect(result).toEqual({ path, changedKeys: ["srvK"] });
  });

  it("refuses non-Windows platforms and a running Photoshop before writing", () => {
    const updatePreferences = vi.fn(() => ({ changedKeys: [] }));

    expect(() =>
      setupGeneratorSettings({ pref: "MachinePrefs.psp" }, { platform: "linux", updatePreferences })
    ).toThrow("only supports Windows");
    expect(updatePreferences).not.toHaveBeenCalled();

    expect(() =>
      setupGeneratorSettings(
        { pref: "MachinePrefs.psp" },
        {
          platform: "win32",
          ensurePhotoshopClosed: () => {
            throw new Error("Photoshop is running");
          },
          updatePreferences,
        }
      )
    ).toThrow("Photoshop is running");
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
