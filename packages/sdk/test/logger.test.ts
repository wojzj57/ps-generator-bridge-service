import { afterEach, describe, expect, it, vi } from "vitest";
import { setGeneratorLogger, useLogger, type Logger } from "../src/plugin";

afterEach(() => {
  setGeneratorLogger();
  vi.restoreAllMocks();
});

describe("useLogger", () => {
  it("formats Error and object args readably and routes fallback levels to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = useLogger("t");
    logger.info("hello", { a: 1 }, new Error("boom"), "str");
    logger.debug("d");
    logger.warn("w");
    logger.error("e");

    const infoLine = log.mock.calls[0]?.[0] as string;
    expect(infoLine).toContain("[info] [t] hello");
    expect(infoLine).toContain('{"a":1}');
    expect(infoLine).toContain("Error: boom");
    expect(infoLine).toContain("str");
    expect(warn).toHaveBeenCalledWith("[warn] [t] w");
    expect(error).toHaveBeenCalledWith("[error] [t] e");
  });

  it("forwards to the generator logger without duplicating level in the message", () => {
    const calls: unknown[][] = [];
    const generatorLogger: Logger = {
      debug: (...args) => calls.push(["debug", ...args]),
      info: (...args) => calls.push(["info", ...args]),
      warn: (...args) => calls.push(["warn", ...args]),
      error: (...args) => calls.push(["error", ...args]),
    };

    const logger = useLogger("plugin-a");
    setGeneratorLogger(generatorLogger);
    logger.warn("failed", { code: 1 });

    expect(calls).toEqual([["warn", "[plugin-a] failed", { code: 1 }]]);
  });

  it("reads the current generator logger when a log method is called", () => {
    const logger = useLogger("late");
    const info = vi.fn();

    setGeneratorLogger({
      debug() {},
      info,
      warn() {},
      error() {},
    });
    logger.info("ready");

    expect(info).toHaveBeenCalledWith("[late] ready");
  });

  it("falls back to the console after clearing the generator logger", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.fn();
    const logger = useLogger("reset");

    setGeneratorLogger({
      debug() {},
      info,
      warn() {},
      error() {},
    });
    logger.info("first");
    setGeneratorLogger();
    logger.info("second");

    expect(info).toHaveBeenCalledWith("[reset] first");
    expect(log).toHaveBeenCalledWith("[info] [reset] second");
  });

  it("does not throw when fallback formatting receives a circular object", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => useLogger("safe").info("value", circular)).not.toThrow();
    expect(log.mock.calls[0]?.[0]).toBe("[info] [safe] value [object Object]");
  });

  it("does not recurse when a bridge logger is installed as the generator logger", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = useLogger("self");

    setGeneratorLogger(logger);

    expect(() => logger.error("boom")).not.toThrow();
    expect(error).toHaveBeenCalledWith("[error] [self] boom");
  });
});
