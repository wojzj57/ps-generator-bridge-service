import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_PASSWORD,
  REMOTE_PASSWORD_ENV,
  resolveRemotePassword,
  validateRemotePassword,
} from "../src/remotePassword";

describe("resolveRemotePassword", () => {
  it("uses option, environment, and default values in order", () => {
    const env = { [REMOTE_PASSWORD_ENV]: "environment1" };

    expect(resolveRemotePassword("explicit1", env)).toBe("explicit1");
    expect(resolveRemotePassword(undefined, env)).toBe("environment1");
    expect(resolveRemotePassword(undefined, {})).toBe(DEFAULT_REMOTE_PASSWORD);
  });

  it("rejects an explicitly configured invalid environment value instead of falling back", () => {
    expect(() => resolveRemotePassword(undefined, { [REMOTE_PASSWORD_ENV]: "" })).toThrow(
      "6-128 visible"
    );
  });
});

describe("validateRemotePassword", () => {
  it("counts Unicode code points", () => {
    expect(validateRemotePassword("😀😁😂🤣😃😄")).toBe("😀😁😂🤣😃😄");
  });

  it.each([
    "short",
    "contains space",
    "contains\ttab",
    "control\u0007",
    "zero\u200Bwidth",
    "--optionLike",
    "a".repeat(129),
  ])("rejects invalid password %# without echoing it", (password) => {
    expect(() => validateRemotePassword(password)).toThrow("6-128 visible");
    try {
      validateRemotePassword(password);
    } catch (error) {
      expect(String(error)).not.toContain(password);
    }
  });
});
