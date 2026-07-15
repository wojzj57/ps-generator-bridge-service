import { join } from "node:path";
import dotenv from "dotenv";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvironment } from "../src/environment";

vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));

describe("loadEnvironment", () => {
  beforeEach(() => vi.mocked(dotenv.config).mockReset());

  it("loads the package-local dotenv file quietly", () => {
    loadEnvironment("C:\\generator-bridge");

    expect(dotenv.config).toHaveBeenCalledWith({
      path: join("C:\\generator-bridge", ".env"),
      quiet: true,
    });
  });
});
