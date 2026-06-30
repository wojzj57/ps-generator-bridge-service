#!/usr/bin/env node
import { runDev, runHarness, setupGeneratorCore, type HarnessOptions } from "./core";

type Command = "setup" | "run" | "dev";

interface Parsed {
  command: Command;
  options: HarnessOptions & { update?: boolean };
}

const USAGE = `Usage:
  ps-bridge-test setup [--update]
  ps-bridge-test run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
  ps-bridge-test dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]`;

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "setup") {
    await setupGeneratorCore({ update: parsed.options.updateCore ?? parsed.options.update });
    return;
  }
  if (parsed.command === "run") {
    await runHarness(parsed.options);
    return;
  }
  await runDev(parsed.options);
}

function parseArgs(args: string[]): Parsed {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args.shift();
  if (command !== "setup" && command !== "run" && command !== "dev") {
    throw usage(`Unknown command: ${command ?? "(missing)"}`);
  }

  const options: Parsed["options"] = {
    expectPlugins: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--update":
        options.update = true;
        break;
      case "--update-core":
        options.updateCore = true;
        break;
      case "--plugin":
        options.plugin = readValue(args, ++i, arg);
        break;
      case "--plugins-dir":
        options.pluginsDir = readValue(args, ++i, arg);
        break;
      case "--expect-plugin":
        options.expectPlugins.push(readValue(args, ++i, arg));
        break;
      case "--port":
        options.port = readNumber(readValue(args, ++i, arg), arg);
        break;
      case "--timeout":
        options.timeoutMs = readNumber(readValue(args, ++i, arg), arg);
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
      default:
        throw usage(`Unknown option: ${arg}`);
    }
  }

  if (command === "setup") return { command, options };
  if (options.plugin && options.pluginsDir) {
    throw usage("--plugin and --plugins-dir are mutually exclusive");
  }
  if (!options.plugin && !options.pluginsDir) {
    throw usage("Either --plugin or --plugins-dir is required");
  }
  return { command, options };
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw usage(`${name} requires a value`);
  return value;
}

function readNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw usage(`${name} must be a positive integer`);
  return parsed;
}

function usage(message: string): Error {
  return new Error(`${message}\n\n${USAGE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
