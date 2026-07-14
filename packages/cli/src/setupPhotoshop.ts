import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { patchMachinePrefs, resolveMachinePrefsPath, updateMachinePrefsFile } from "./machinePrefs";
import { ensurePhotoshopNotRunning } from "./photoshop";
import { resolveRemotePassword } from "./remotePassword";
import { inspectRuntimeTarget, setupGeneratorRuntime } from "./setup";

export interface SetupPhotoshopOptions {
  version?: string;
  yes?: boolean;
  password?: string;
  runtimeVersion?: string;
}

export interface PhotoshopInstall {
  displayName: string;
  year?: string;
  installDir: string;
  registryKey: string;
}

interface RegistryBlock {
  key: string;
  values: Map<string, string>;
}

export async function setupPhotoshop(options: SetupPhotoshopOptions = {}): Promise<void> {
  ensureWindows();
  ensurePhotoshopNotRunning();
  const password = resolveRemotePassword(options.password);
  const installs = discoverPhotoshopInstallations();
  if (installs.length === 0) {
    throw new Error("No Photoshop installations were found in the Windows registry.");
  }

  const selected = options.version
    ? selectByVersion(installs, options.version)
    : await promptForPhotoshop(installs);

  const targetDir = join(selected.installDir, "Plug-ins", "Generator", "generator-bridge");
  const overwriteUnmanaged = await confirmRuntimeReplacement(targetDir, options.yes ?? false);
  if (overwriteUnmanaged === undefined) {
    console.log("Installation cancelled.");
    return;
  }

  const targetPrefs = photoshopPrefsPath(selected);
  const preferencesExist = existsSync(targetPrefs);
  let validatedPrefs: string | undefined;
  if (preferencesExist) {
    validatedPrefs = resolveMachinePrefsPath(targetPrefs);
    patchMachinePrefs(readFileSync(validatedPrefs), password);
  }

  const result = setupGeneratorRuntime({
    dir: targetDir,
    overwriteUnmanaged,
    runtimeVersion: options.runtimeVersion,
  });
  console.log(`Installed generator runtime ${result.version}: ${result.targetDir}`);

  if (!preferencesExist) {
    console.warn(`Photoshop settings do not exist yet: ${targetPrefs}`);
    console.warn(
      `The generator runtime is installed, but preferences could not be configured. Open ${selected.displayName} once, close it completely, then rerun setup-photoshop with the same password option or environment variable.`
    );
    return;
  }

  const prefsResult = updateMachinePrefsFile(validatedPrefs ?? targetPrefs, password);
  const updated = prefsResult.changedKeys.length > 0 ? prefsResult.changedKeys.join(", ") : "none";
  console.log(`Configured Photoshop settings: ${targetPrefs}`);
  console.log(`Updated preference keys: ${updated}`);
  console.log("Installation complete. Restart Photoshop for the changes to take effect.");
}

export async function confirmRuntimeReplacement(
  targetDir: string,
  yes: boolean,
  confirm: (question: string) => Promise<boolean> = promptYesNo
): Promise<boolean | undefined> {
  if (inspectRuntimeTarget(targetDir) !== "unmanaged") return false;
  if (yes) return true;
  const confirmed = await confirm(
    `The target directory contains files not managed by PS Generator Bridge. Replace it?\n${targetDir}`
  );
  return confirmed ? true : undefined;
}

export function discoverPhotoshopInstallations(): PhotoshopInstall[] {
  const roots = [
    "HKLM\\SOFTWARE\\Adobe\\Photoshop",
    "HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Photoshop",
  ];
  const byDir = new Map<string, PhotoshopInstall>();

  for (const root of roots) {
    for (const block of queryRegistry(root)) {
      const rawPath = block.values.get("ApplicationPath") ?? block.values.get("InstallPath");
      if (!rawPath) continue;
      const installDir = normalizeInstallDir(rawPath);
      if (!existsSync(installDir)) continue;
      const displayName = displayNameFromInstallDir(installDir);
      if (!displayName) continue;
      byDir.set(installDir.toLowerCase(), {
        displayName,
        year: yearFromDisplayName(displayName),
        installDir,
        registryKey: block.key,
      });
    }
  }

  return [...byDir.values()].sort((a, b) => {
    const yearA = Number(a.year ?? 0);
    const yearB = Number(b.year ?? 0);
    if (yearA !== yearB) return yearB - yearA;
    return a.displayName.localeCompare(b.displayName);
  });
}

function ensureWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("setup-photoshop only supports Windows.");
  }
}

function queryRegistry(root: string): RegistryBlock[] {
  let text: string;
  try {
    text = execFileSync("reg", ["query", root, "/s"], { encoding: "utf8" });
  } catch {
    return [];
  }

  const blocks: RegistryBlock[] = [];
  let current: RegistryBlock | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("HKEY_")) {
      current = { key: line.trim(), values: new Map() };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const match = line.match(/^\s{2,}(.+?)\s+REG_\w+\s+(.+)$/);
    if (!match) continue;
    const [, name, value] = match;
    if (!name || !value) continue;
    current.values.set(name.trim(), value.trim());
  }
  return blocks;
}

function normalizeInstallDir(rawPath: string): string {
  const trimmed = rawPath.replace(/^"|"$/g, "");
  if (/Photoshop\.exe$/i.test(trimmed)) return dirname(trimmed);
  return trimmed.replace(/[\\/]+$/, "");
}

function displayNameFromInstallDir(installDir: string): string | undefined {
  const name = installDir.split(/[\\/]/).filter(Boolean).at(-1);
  if (!name || !/^Adobe Photoshop/i.test(name)) return undefined;
  return name;
}

function yearFromDisplayName(displayName: string): string | undefined {
  return displayName.match(/\b(20\d{2})\b/)?.[1];
}

function selectByVersion(installs: PhotoshopInstall[], version: string): PhotoshopInstall {
  const normalized = version.trim();
  const matches = installs.filter(
    (install) =>
      install.year === normalized ||
      install.displayName.toLowerCase().includes(normalized.toLowerCase())
  );
  if (matches.length === 1) return matches[0] as PhotoshopInstall;
  if (matches.length > 1) {
    throw new Error(
      `Multiple Photoshop installations matched '${version}': ${matches.map((i) => i.displayName).join(", ")}`
    );
  }
  throw new Error(
    `No Photoshop installation matched '${version}'. Found: ${installs.map((i) => i.displayName).join(", ")}`
  );
}

async function promptForPhotoshop(installs: PhotoshopInstall[]): Promise<PhotoshopInstall> {
  if (installs.length === 1) {
    const onlyInstall = installs[0] as PhotoshopInstall;
    console.log(`Using ${onlyInstall.displayName}: ${onlyInstall.installDir}`);
    return onlyInstall;
  }

  console.log("Select a Photoshop installation:");
  installs.forEach((install, index) => {
    console.log(`  ${index + 1}. ${install.displayName} (${install.installDir})`);
  });

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question("Photoshop version number: ")).trim();
      const index = Number(answer);
      if (Number.isInteger(index) && index >= 1 && index <= installs.length) {
        return installs[index - 1] as PhotoshopInstall;
      }
      console.log(`Enter a number from 1 to ${installs.length}.`);
    }
  } finally {
    rl.close();
  }
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
      if (answer === "" || answer === "n" || answer === "no") return false;
      if (answer === "y" || answer === "yes") return true;
      console.log("Enter y or n.");
    }
  } finally {
    rl.close();
  }
}

export function photoshopPrefsPath(install: PhotoshopInstall): string {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA is not set; cannot resolve Photoshop settings directory.");
  return join(
    appData,
    "Adobe",
    install.displayName,
    `${install.displayName} Settings`,
    "MachinePrefs.psp"
  );
}
