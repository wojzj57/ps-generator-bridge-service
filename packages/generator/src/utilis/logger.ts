/**
 * Minimal leveled logger. Console-based to keep the scaffold dependency-light;
 * pino (or any sink) can be swapped in later behind this same `Logger` shape.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function format(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === "object" && arg !== null) return JSON.stringify(arg);
      return String(arg);
    })
    .join(" ");
}

export function createLogger(name = "ps-bridge"): Logger {
  const emit = (level: LogLevel, message: string, args: unknown[]): void => {
    const line = `[${level}] ${name}: ${message}${args.length ? ` ${format(args)}` : ""}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (message, ...args) => emit("debug", message, args),
    info: (message, ...args) => emit("info", message, args),
    warn: (message, ...args) => emit("warn", message, args),
    error: (message, ...args) => emit("error", message, args),
  };
}
