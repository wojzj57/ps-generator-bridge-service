import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { valid } from "semver";

export const GENERATOR_PACKAGE = "@ps-generator-bridge/generator";
export const GENERATOR_RELEASE_ASSET = "ps-generator-bridge.zip";
export const GENERATOR_REPOSITORY = "wojzj57/ps-generator-bridge-service";

const GITHUB_ORIGIN = "https://github.com";
const CONNECT_TIMEOUT_SECONDS = 30;
const DOWNLOAD_TIMEOUT_SECONDS = 300;
const TRANSIENT_CURL_STATUSES = new Set([5, 6, 7, 18, 28, 35, 52, 55, 56, 92]);

export interface ResolvedRuntimeRelease {
  version: string;
  assetUrl: string;
}

export interface RuntimeReleaseClient {
  resolve(requested: string): ResolvedRuntimeRelease;
  install(release: ResolvedRuntimeRelease, packageDir: string): void;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { inheritStderr?: boolean }
) => CommandResult;

export interface GitHubReleaseClientOptions {
  env?: NodeJS.ProcessEnv;
  curlPath?: string;
  tarPath?: string;
  run?: CommandRunner;
  warn?: (message: string) => void;
}

export function createGitHubReleaseClient(
  options: GitHubReleaseClientOptions = {}
): RuntimeReleaseClient {
  const env = options.env ?? process.env;
  const system32 = join(env.WINDIR ?? "C:\\Windows", "System32");
  const curlPath = options.curlPath ?? join(system32, "curl.exe");
  const tarPath = options.tarPath ?? join(system32, "tar.exe");
  const run = options.run ?? runCommand;
  const warn = options.warn ?? console.warn;

  return {
    resolve(requested) {
      if (requested !== "latest") {
        assertExactVersion(requested);
        return {
          version: requested,
          assetUrl: releaseAssetUrl(generatorReleaseTag(requested)),
        };
      }

      const output = runLatestRequestWithRetry(curlPath, run, warn);
      return {
        version: parseLatestReleaseVersion(output),
        assetUrl: `${GITHUB_ORIGIN}/${GENERATOR_REPOSITORY}/releases/latest/download/${GENERATOR_RELEASE_ASSET}`,
      };
    },

    install(release, packageDir) {
      mkdirSync(packageDir, { recursive: true });
      const archivePath = join(dirname(packageDir), GENERATOR_RELEASE_ASSET);
      try {
        downloadWithRetry(curlPath, release.assetUrl, archivePath, run, warn);
        const listing = requireSuccessfulCommand(
          run(tarPath, ["-tf", archivePath]),
          `Unable to inspect downloaded Generator archive with ${tarPath}`
        );
        validateArchiveEntries(listing);
        requireSuccessfulCommand(
          run(tarPath, ["-xf", archivePath, "-C", packageDir], { inheritStderr: true }),
          `Unable to extract downloaded Generator archive with ${tarPath}`
        );
      } finally {
        rmSync(archivePath, { force: true });
      }
    },
  };
}

export function generatorReleaseTag(version: string): string {
  assertExactVersion(version);
  return `${GENERATOR_PACKAGE}@${version}`;
}

export function parseLatestReleaseVersion(output: string): string {
  const status = parseHttpStatus(output);
  if (![301, 302, 303, 307, 308].includes(status)) {
    throw new Error(`GitHub latest release did not redirect to a release tag (HTTP ${status})`);
  }

  const locations = [...output.matchAll(/^location:\s*(.+?)\r?$/gimu)];
  const location = locations.at(-1)?.[1]?.trim();
  if (!location) throw new Error("GitHub latest release response has no Location header");

  const url = new URL(location, GITHUB_ORIGIN);
  if (url.origin !== GITHUB_ORIGIN) {
    throw new Error(`GitHub latest release redirected to an unexpected origin: ${url.origin}`);
  }
  const prefix = `/${GENERATOR_REPOSITORY}/releases/tag/`;
  if (!url.pathname.startsWith(prefix)) {
    throw new Error(`GitHub latest release redirected to an unexpected path: ${url.pathname}`);
  }

  const tag = decodeURIComponent(url.pathname.slice(prefix.length));
  const tagPrefix = `${GENERATOR_PACKAGE}@`;
  if (!tag.startsWith(tagPrefix)) {
    throw new Error(`GitHub latest release has an unexpected tag: ${tag}`);
  }
  const version = tag.slice(tagPrefix.length);
  assertExactVersion(version);
  return version;
}

export function validateArchiveEntries(listing: string): void {
  const entries = listing.split(/\r?\n/u).filter((entry) => entry.trim().length > 0);
  if (entries.length === 0) throw new Error("Downloaded Generator archive is empty");

  let hasManifest = false;
  for (const entry of entries) {
    const normalized = entry.trim().replace(/\\/gu, "/");
    if (
      normalized.startsWith("/") ||
      /^[A-Za-z]:/u.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      throw new Error(`Downloaded Generator archive contains an unsafe path: ${entry}`);
    }
    if (normalized.replace(/^(\.\/)+/u, "") === "package.json") hasManifest = true;
  }

  if (!hasManifest) {
    throw new Error("Downloaded Generator archive does not contain package.json at its root");
  }
}

function assertExactVersion(version: string): void {
  if (valid(version) !== version || version.includes("+")) {
    throw new Error(`Invalid generator runtime version: ${version}; use latest or an exact semver`);
  }
}

function releaseAssetUrl(tag: string): string {
  return `${GITHUB_ORIGIN}/${GENERATOR_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${GENERATOR_RELEASE_ASSET}`;
}

function runLatestRequestWithRetry(
  curlPath: string,
  run: CommandRunner,
  warn: (message: string) => void
): string {
  const url = `${GITHUB_ORIGIN}/${GENERATOR_REPOSITORY}/releases/latest`;
  const args = [
    "--silent",
    "--show-error",
    "--head",
    "--max-redirs",
    "0",
    "--connect-timeout",
    String(CONNECT_TIMEOUT_SECONDS),
    "--max-time",
    String(CONNECT_TIMEOUT_SECONDS),
    "--write-out",
    "\n%{http_code}",
    url,
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = run(curlPath, args);
    const httpStatus = parseHttpStatus(result.stdout);
    if (result.status === 0 && [301, 302, 303, 307, 308].includes(httpStatus)) {
      return result.stdout;
    }
    if (attempt === 0 && isTransientFailure(result.status, httpStatus)) {
      warn("[generator-runtime] latest release check failed transiently; retrying once");
      continue;
    }
    throw commandError("Unable to resolve the latest Generator GitHub Release", result, httpStatus);
  }
  throw new Error("Unable to resolve the latest Generator GitHub Release");
}

function downloadWithRetry(
  curlPath: string,
  url: string,
  archivePath: string,
  run: CommandRunner,
  warn: (message: string) => void
): void {
  const args = [
    "--fail",
    "--location",
    "--connect-timeout",
    String(CONNECT_TIMEOUT_SECONDS),
    "--max-time",
    String(DOWNLOAD_TIMEOUT_SECONDS),
    "--output",
    archivePath,
    "--write-out",
    "\n%{http_code}",
    url,
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    rmSync(archivePath, { force: true });
    const result = run(curlPath, args, { inheritStderr: true });
    const httpStatus = parseHttpStatus(result.stdout);
    if (result.status === 0 && httpStatus >= 200 && httpStatus < 300) return;
    if (attempt === 0 && isTransientFailure(result.status, httpStatus)) {
      warn("[generator-runtime] release download failed transiently; retrying once");
      continue;
    }
    throw commandError("Unable to download Generator GitHub Release", result, httpStatus);
  }
}

function parseHttpStatus(output: string): number {
  const match = output.trimEnd().match(/(?:^|\r?\n)(\d{3})$/u);
  return match ? Number(match[1]) : 0;
}

function isTransientFailure(curlStatus: number | null, httpStatus: number): boolean {
  return (
    (curlStatus !== null && TRANSIENT_CURL_STATUSES.has(curlStatus)) ||
    (httpStatus >= 500 && httpStatus <= 599)
  );
}

function requireSuccessfulCommand(result: CommandResult, message: string): string {
  if (result.status !== 0) throw commandError(message, result, 0);
  return result.stdout;
}

function commandError(message: string, result: CommandResult, httpStatus: number): Error {
  const details = result.error?.message || result.stderr.trim();
  const status = httpStatus > 0 ? ` (HTTP ${httpStatus})` : "";
  return new Error(`${message}${status}${details ? `: ${details}` : ""}`);
}

function runCommand(
  command: string,
  args: string[],
  options: { inheritStderr?: boolean } = {}
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.inheritStderr ? "inherit" : "pipe"],
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error,
  };
}
