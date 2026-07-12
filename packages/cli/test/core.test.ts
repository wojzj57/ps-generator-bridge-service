import { describe, expect, it } from "vitest";
import { generatorCoreArguments } from "../src/core";

describe("generatorCoreArguments", () => {
  it("passes the configured Photoshop password to generator-core", () => {
    expect(generatorCoreArguments("app.js", "generator-plugin", "custom12")).toEqual([
      "app.js",
      "-f",
      "generator-plugin",
      "-P",
      "custom12",
    ]);
  });
});
