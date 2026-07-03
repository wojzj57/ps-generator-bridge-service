export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const LOGGER_KEY = Symbol.for("ps-generator-bridge.logger");
const BRIDGE_LOGGER_KEY = Symbol.for("ps-generator-bridge.logger.bridge");

type BridgeLogger = Logger & { [BRIDGE_LOGGER_KEY]: true };

function loggerStore(): Record<symbol, Logger | undefined> {
  return globalThis as unknown as Record<symbol, Logger | undefined>;
}

function currentGeneratorLogger(): Logger | undefined {
  return loggerStore()[LOGGER_KEY];
}

function isBridgeLogger(logger: Logger | undefined): logger is BridgeLogger {
  return Boolean(
    logger &&
      typeof logger === "object" &&
      (logger as Partial<BridgeLogger>)[BRIDGE_LOGGER_KEY] === true
  );
}

function format(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

function consoleEmit(level: LogLevel, name: string, message: string, args: unknown[]): void {
  const line = `[${level}] [${name}] ${message}${args.length ? ` ${format(args)}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function emit(level: LogLevel, name: string, message: string, args: unknown[]): void {
  const logger = currentGeneratorLogger();
  if (logger && !isBridgeLogger(logger)) {
    logger[level](`[${name}] ${message}`, ...args);
    return;
  }
  consoleEmit(level, name, message, args);
}

export function setGeneratorLogger(logger?: Logger): void {
  loggerStore()[LOGGER_KEY] = isBridgeLogger(logger) ? undefined : logger;
}

export function useLogger(name = "ps-bridge"): Logger {
  return {
    [BRIDGE_LOGGER_KEY]: true,
    debug: (message, ...args) => emit("debug", name, message, args),
    info: (message, ...args) => emit("info", name, message, args),
    warn: (message, ...args) => emit("warn", name, message, args),
    error: (message, ...args) => emit("error", name, message, args),
  } satisfies BridgeLogger;
}
