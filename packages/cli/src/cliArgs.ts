import type { HarnessOptions } from "./core";
import type { SetupOptions } from "./setup";
import type { SetupPhotoshopOptions } from "./setupPhotoshop";

export type Command =
  | "setup"
  | "setup-photoshop"
  | "setup-generator-settings"
  | "setup-core"
  | "run"
  | "dev"
  | "clean";

export interface CliOptions extends HarnessOptions, SetupOptions, SetupPhotoshopOptions {
  update?: boolean;
  pref?: string;
}

export interface ParsedArgs {
  command: Command | "help";
  options: CliOptions;
}

export const USAGE = `Usage:
  ps-generator-bridge setup [--dir <dir>] [--runtime-version <latest-or-exact-version>]
  ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>] [--runtime-version <latest-or-exact-version>]
  ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
  ps-generator-bridge setup-core [--update]
  ps-generator-bridge run (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <latest-or-exact-version>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
  ps-generator-bridge dev (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <latest-or-exact-version>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
  ps-generator-bridge clean`;

export function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", options: {} };
  }

  const command = args.shift();
  if (!isCommand(command)) throw usage(`Unknown command: ${command ?? "(missing)"}`);

  const options: CliOptions = {};
  if (command === "clean") {
    if (args.length > 0) throw usage(`clean does not accept any options: ${args[0]}`);
    return { command, options };
  }

  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--update":
        markOnce(seen, "update", arg);
        options.update = true;
        break;
      case "--update-core":
        markOnce(seen, "updateCore", arg);
        options.updateCore = true;
        break;
      case "--dir":
        markOnce(seen, "dir", arg);
        options.dir = readValue(args, ++index, arg);
        break;
      case "--version":
        markOnce(seen, "version", arg);
        options.version = readValue(args, ++index, arg);
        break;
      case "--yes":
        markOnce(seen, "yes", arg);
        options.yes = true;
        break;
      case "--pref":
      case "-pref":
        markOnce(seen, "pref", arg);
        options.pref = readValue(args, ++index, arg);
        break;
      case "--password":
        markOnce(seen, "password", arg);
        options.password = readValue(args, ++index, arg);
        break;
      case "--plugin":
        markOnce(seen, "plugin", arg);
        options.plugin = readValue(args, ++index, arg);
        break;
      case "--plugin-cwd":
        markOnce(seen, "pluginCwd", arg);
        options.pluginCwd = true;
        break;
      case "--plugins-dir":
        markOnce(seen, "pluginsDir", arg);
        options.pluginsDir = readValue(args, ++index, arg);
        break;
      case "--runtime-version":
        markOnce(seen, "runtimeVersion", arg);
        options.runtimeVersion = readValue(args, ++index, arg);
        break;
      case "--port":
        markOnce(seen, "port", arg);
        options.port = readNumber(readValue(args, ++index, arg), arg);
        break;
      case "--timeout":
        markOnce(seen, "timeout", arg);
        options.timeoutMs = readNumber(readValue(args, ++index, arg), arg);
        break;
      case "--help":
      case "-h":
        return { command: "help", options };
      default:
        throw usage(`Unknown option: ${arg}`);
    }
  }

  validateCommandOptions(command, options);
  return { command, options };
}

function validateCommandOptions(command: Command, options: CliOptions): void {
  if (command === "setup") {
    if (
      options.version ||
      options.yes ||
      options.pref ||
      options.password !== undefined ||
      options.update ||
      options.updateCore ||
      hasPluginOrHarnessOptions(options)
    ) {
      throw usage("setup only accepts --dir and --runtime-version");
    }
    return;
  }

  if (command === "setup-photoshop") {
    if (
      options.dir ||
      options.pref ||
      options.update ||
      options.updateCore ||
      hasPluginOrHarnessOptions(options)
    ) {
      throw usage(
        "setup-photoshop only accepts --version, --yes, --password, and --runtime-version"
      );
    }
    return;
  }

  if (command === "setup-generator-settings") {
    if (!options.pref) throw usage("setup-generator-settings requires --pref or -pref");
    if (
      options.dir ||
      options.version ||
      options.yes ||
      options.update ||
      options.updateCore ||
      options.runtimeVersion ||
      hasPluginOrHarnessOptions(options)
    ) {
      throw usage("setup-generator-settings only accepts --pref, -pref, and --password");
    }
    return;
  }

  if (command === "setup-core") {
    if (
      options.dir ||
      options.version ||
      options.yes ||
      options.pref ||
      options.password !== undefined ||
      options.updateCore ||
      options.runtimeVersion ||
      hasPluginOrHarnessOptions(options)
    ) {
      throw usage("setup-core only accepts --update");
    }
    return;
  }

  if (options.dir || options.version || options.yes || options.pref || options.update) {
    throw usage(`${command} does not accept setup options`);
  }
  const pluginSourceCount = [options.plugin, options.pluginCwd, options.pluginsDir].filter(
    Boolean
  ).length;
  if (pluginSourceCount !== 1) {
    throw usage("Exactly one of --plugin, --plugin-cwd, or --plugins-dir is required");
  }
}

function hasPluginOrHarnessOptions(options: CliOptions): boolean {
  return Boolean(
    options.plugin || options.pluginCwd || options.pluginsDir || options.port || options.timeoutMs
  );
}

function isCommand(value: string | undefined): value is Command {
  return (
    value === "setup" ||
    value === "setup-photoshop" ||
    value === "setup-generator-settings" ||
    value === "setup-core" ||
    value === "run" ||
    value === "dev" ||
    value === "clean"
  );
}

function markOnce(seen: Set<string>, key: string, option: string): void {
  if (seen.has(key)) throw usage(`${option} must not be provided more than once`);
  seen.add(key);
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw usage(`${name} requires a value`);
  return value;
}

function readNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw usage(`${name} must be a positive integer`);
  }
  return parsed;
}

function usage(message: string): Error {
  return new Error(`${message}\n\n${USAGE}`);
}
