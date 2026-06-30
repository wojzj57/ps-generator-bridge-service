import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger } from "../src/utilis/logger";

afterEach(() => vi.restoreAllMocks());

describe("createLogger", () => {
  it("formats Error and object args readably and routes levels to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = createLogger("t");
    logger.info("hello", { a: 1 }, new Error("boom"), "str");
    logger.debug("d");
    logger.warn("w");
    logger.error("e");

    const infoLine = log.mock.calls[0]?.[0] as string;
    expect(infoLine).toContain("t: hello");
    expect(infoLine).toContain('{"a":1}');
    expect(infoLine).toContain("Error: boom");
    expect(infoLine).toContain("str");
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it("emits a bare message with no args", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    createLogger().info("just a message");
    expect(log.mock.calls[0]?.[0]).toBe("[info] ps-bridge: just a message");
  });
});
