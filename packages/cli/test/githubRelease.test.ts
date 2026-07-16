import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGitHubReleaseClient,
  GENERATOR_RELEASE_ASSET,
  generatorReleaseTag,
  parseLatestReleaseVersion,
  type CommandResult,
  validateArchiveEntries,
} from "../src/githubRelease";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("GitHub Generator releases", () => {
  it("resolves latest from the GitHub redirect and keeps the fixed latest asset URL", () => {
    const run = vi.fn(() =>
      result(
        0,
        "HTTP/1.1 302 Found\r\nLocation: https://github.com/wojzj57/ps-generator-bridge-service/releases/tag/%40ps-generator-bridge%2Fgenerator%401.2.3\r\n\r\n302"
      )
    );
    const client = createGitHubReleaseClient({
      curlPath: "curl.exe",
      tarPath: "tar.exe",
      run,
    });

    expect(client.resolve("latest")).toEqual({
      version: "1.2.3",
      assetUrl:
        "https://github.com/wojzj57/ps-generator-bridge-service/releases/latest/download/ps-generator-bridge.zip",
    });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[1]).toContain("--head");
  });

  it("builds an encoded package-tag URL for an exact stable or prerelease version", () => {
    const run = vi.fn();
    const client = createGitHubReleaseClient({
      curlPath: "curl.exe",
      tarPath: "tar.exe",
      run,
    });

    expect(client.resolve("1.2.3")).toEqual({
      version: "1.2.3",
      assetUrl:
        "https://github.com/wojzj57/ps-generator-bridge-service/releases/download/%40ps-generator-bridge%2Fgenerator%401.2.3/ps-generator-bridge.zip",
    });
    expect(client.resolve("2.0.0-beta.1").version).toBe("2.0.0-beta.1");
    expect(generatorReleaseTag("1.2.3")).toBe("@ps-generator-bridge/generator@1.2.3");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects npm dist-tags, build metadata, and unexpected latest redirects", () => {
    const client = createGitHubReleaseClient({
      curlPath: "curl.exe",
      tarPath: "tar.exe",
      run: vi.fn(),
    });

    expect(() => client.resolve("next")).toThrow("use latest or an exact semver");
    expect(() => client.resolve("1.0.0+build.1")).toThrow("use latest or an exact semver");
    expect(() =>
      parseLatestReleaseVersion(
        "HTTP/1.1 302 Found\r\nLocation: https://attacker.test/releases/tag/v1.0.0\r\n\r\n302"
      )
    ).toThrow("unexpected origin");
    expect(() => parseLatestReleaseVersion("HTTP/1.1 404 Not Found\r\n\r\n404")).toThrow(
      "did not redirect"
    );
  });

  it("retries one transient latest check and one transient asset download", () => {
    const warn = vi.fn();
    let latestAttempts = 0;
    let downloadAttempts = 0;
    const run = vi.fn((command: string, args: string[]) => {
      if (command === "curl.exe" && args.includes("--head")) {
        latestAttempts += 1;
        if (latestAttempts === 1) return result(0, "HTTP/1.1 503 Unavailable\r\n\r\n503");
        return result(
          0,
          "HTTP/1.1 302 Found\r\nLocation: /wojzj57/ps-generator-bridge-service/releases/tag/%40ps-generator-bridge%2Fgenerator%401.2.3\r\n\r\n302"
        );
      }
      if (command === "curl.exe") {
        downloadAttempts += 1;
        return downloadAttempts === 1 ? result(28, "000") : result(0, "200");
      }
      if (args[0] === "-tf") return result(0, "./package.json\n./main.js\n");
      return result(0);
    });
    const client = createGitHubReleaseClient({
      curlPath: "curl.exe",
      tarPath: "tar.exe",
      run,
      warn,
    });
    const release = client.resolve("latest");
    const root = newRoot();

    client.install(release, join(root, "package"));

    expect(latestAttempts).toBe(2);
    expect(downloadAttempts).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
    const downloadCall = run.mock.calls.find(
      ([command, args]) => command === "curl.exe" && !args.includes("--head")
    );
    expect(downloadCall?.[1]).toContain("300");
  });

  it("does not retry a missing release asset", () => {
    const run = vi.fn(() => result(22, "404", "curl: (22) HTTP 404"));
    const client = createGitHubReleaseClient({
      curlPath: "curl.exe",
      tarPath: "tar.exe",
      run,
    });
    const root = newRoot();

    expect(() =>
      client.install(
        { version: "1.2.3", assetUrl: "https://example.test/ps-generator-bridge.zip" },
        join(root, "package")
      )
    ).toThrow("HTTP 404");
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects empty, nested-manifest, absolute, drive, and traversal archive entries", () => {
    expect(() => validateArchiveEntries("")).toThrow("archive is empty");
    expect(() => validateArchiveEntries("nested/package.json\nmain.js\n")).toThrow(
      "package.json at its root"
    );
    expect(() => validateArchiveEntries("package.json\n/absolute.txt\n")).toThrow("unsafe path");
    expect(() => validateArchiveEntries("package.json\nC:\\escape.txt\n")).toThrow("unsafe path");
    expect(() => validateArchiveEntries("package.json\nC:escape.txt\n")).toThrow("unsafe path");
    expect(() => validateArchiveEntries("package.json\n../escape.txt\n")).toThrow("unsafe path");
    expect(() => validateArchiveEntries("./package.json\n./main.js\n")).not.toThrow();
  });

  it("uses the fixed Generator asset name", () => {
    expect(GENERATOR_RELEASE_ASSET).toBe("ps-generator-bridge.zip");
  });
});

function result(status: number | null, stdout = "", stderr = ""): CommandResult {
  return { status, stdout, stderr };
}

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-github-release-"));
  roots.push(root);
  return root;
}
