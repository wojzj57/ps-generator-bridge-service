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
  ps-generator-bridge setup [--dir <dir>]
  ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>]
  ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
  ps-generator-bridge setup-core [--update]
  ps-generator-bridge run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
  ps-generator-bridge dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
  ps-generator-bridge clean`;

export function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", options: { expectPlugins: [] } };
  }

  const command = args.shift();
  if (!isCommand(command)) {
    throw usage(`Unknown command: ${command ?? "(missing)"}`);
  }

  const options: CliOptions = { expectPlugins: [] };
  if (command === "clean") {
    if (args.length > 0) throw usage(`clean does not accept any options: ${args[0]}`);
    return { command, options };
  }

  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--update":
        options.update = true;
        break;
      case "--update-core":
        options.updateCore = true;
        break;
      case "--dir":
        options.dir = readValue(args, ++index, arg);
        break;
      case "--version":
        options.version = readValue(args, ++index, arg);
        break;
      case "--yes":
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
        options.plugin = readValue(args, ++index, arg);
        break;
      case "--plugins-dir":
        options.pluginsDir = readValue(args, ++index, arg);
        break;
      case "--expect-plugin":
        options.expectPlugins.push(readValue(args, ++index, arg));
        break;
      case "--port":
        options.port = readNumber(readValue(args, ++index, arg), arg);
        break;
      case "--timeout":
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
      hasHarnessOrUpdateOptions(options)
    ) {
      throw usage("setup only accepts --dir");
    }
    return;
  }

  if (command === "setup-photoshop") {
    if (options.dir || options.pref || hasHarnessOrUpdateOptions(options)) {
      throw usage("setup-photoshop only accepts --version, --yes, and --password");
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
      options.plugin ||
      options.pluginsDir ||
      options.port ||
      options.timeoutMs ||
      options.expectPlugins.length > 0
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
      options.plugin ||
      options.pluginsDir ||
      options.port ||
      options.timeoutMs ||
      options.expectPlugins.length > 0
    ) {
      throw usage("setup-core only accepts --update");
    }
    return;
  }

  if (options.dir || options.version || options.yes || options.pref || options.update) {
    throw usage(`${command} does not accept setup options`);
  }
  if (options.plugin && options.pluginsDir) {
    throw usage("--plugin and --plugins-dir are mutually exclusive");
  }
  if (!options.plugin && !options.pluginsDir) {
    throw usage("Either --plugin or --plugins-dir is required");
  }
}

function hasHarnessOrUpdateOptions(options: CliOptions): boolean {
  return Boolean(
    options.update ||
    options.updateCore ||
    options.plugin ||
    options.pluginsDir ||
    options.port ||
    options.timeoutMs ||
    options.expectPlugins.length > 0
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
