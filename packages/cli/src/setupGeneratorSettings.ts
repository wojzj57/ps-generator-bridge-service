import { updateMachinePrefsFile, resolveMachinePrefsPath } from "./machinePrefs";
import { ensurePhotoshopNotRunning } from "./photoshop";
import { resolveRemotePassword } from "./remotePassword";

export interface SetupGeneratorSettingsOptions {
  pref: string;
  password?: string;
}

export interface SetupGeneratorSettingsResult {
  path: string;
  changedKeys: string[];
}

interface SetupGeneratorSettingsDependencies {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  ensurePhotoshopClosed?: () => void;
  updatePreferences?: typeof updateMachinePrefsFile;
}

export function setupGeneratorSettings(
  options: SetupGeneratorSettingsOptions,
  dependencies: SetupGeneratorSettingsDependencies = {}
): SetupGeneratorSettingsResult {
  if ((dependencies.platform ?? process.platform) !== "win32") {
    throw new Error("setup-generator-settings only supports Windows.");
  }

  (dependencies.ensurePhotoshopClosed ?? ensurePhotoshopNotRunning)();
  const path = resolveMachinePrefsPath(options.pref, dependencies.cwd);
  const password = resolveRemotePassword(options.password, dependencies.env);
  const result = (dependencies.updatePreferences ?? updateMachinePrefsFile)(path, password);
  return { path, changedKeys: result.changedKeys };
}
