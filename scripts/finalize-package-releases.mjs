#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GENERATOR_PACKAGE = "@ps-generator-bridge/generator";
const PACKAGE_MANIFESTS = [
  { name: "@ps-generator-bridge/cli", path: "packages/cli/package.json" },
  { name: GENERATOR_PACKAGE, path: "packages/generator/package.json" },
  { name: "@ps-generator-bridge/sdk", path: "packages/sdk/package.json" },
];
const PUBLISHABLE_PACKAGES = new Set(PACKAGE_MANIFESTS.map((entry) => entry.name));
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export function parsePublishedPackages(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("PUBLISHED_PACKAGES must be valid JSON.", { cause: error });
  }
  if (!Array.isArray(parsed)) {
    throw new Error("PUBLISHED_PACKAGES must be a JSON array.");
  }

  const seen = new Set();
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each published package must be an object.");
    }
    const { name, version } = entry;
    if (!PUBLISHABLE_PACKAGES.has(name)) {
      throw new Error(`Unexpected published package: ${String(name)}`);
    }
    if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
      throw new Error(`Invalid published version for ${name}: ${String(version)}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate published package: ${name}`);
    seen.add(name);
    return { name, version };
  });
}

export function buildReleasePlan(packages) {
  return {
    tags: packages.map((entry) => `${entry.name}@${entry.version}`),
    generator: packages.find((entry) => entry.name === GENERATOR_PACKAGE),
  };
}

export function findVersionChanges(beforeVersions, afterVersions) {
  return PACKAGE_MANIFESTS.flatMap(({ name }) => {
    const before = beforeVersions[name];
    const after = afterVersions[name];
    if (typeof before !== "string" || !VERSION_PATTERN.test(before)) {
      throw new Error(`Invalid base version for ${name}: ${String(before)}`);
    }
    if (typeof after !== "string" || !VERSION_PATTERN.test(after)) {
      throw new Error(`Invalid release version for ${name}: ${String(after)}`);
    }
    return before === after ? [] : [{ name, version: after }];
  });
}

export function reconcilePublishedPackages(versionChanges, reportedPackages) {
  for (const reported of reportedPackages) {
    const changed = versionChanges.find((entry) => entry.name === reported.name);
    if (!changed || changed.version !== reported.version) {
      throw new Error(
        `Published package ${reported.name}@${reported.version} is not present in the release commit.`
      );
    }
  }
  return versionChanges;
}

export function extractChangelogEntry(markdown, version) {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const heading = `## ${version}`;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`Generator changelog has no ${heading} entry.`);

  const next = lines.findIndex((line, index) => index > start && /^##\s+/u.test(line));
  const body = lines
    .slice(start + 1, next === -1 ? lines.length : next)
    .join("\n")
    .trim();
  if (!body) throw new Error(`Generator changelog entry ${heading} is empty.`);
  return body;
}

export function generatorAssetName(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid Generator asset version: ${String(version)}`);
  }
  return `ps-generator-bridge-${version}.zip`;
}

export function buildGeneratorReleaseCreateArgs({ assetPath, notesFile, repository, tag }) {
  return [
    "release",
    "create",
    tag,
    assetPath,
    "--repo",
    repository,
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    notesFile,
  ];
}

export function buildGeneratorReleaseUploadArgs({ assetPath, repository, tag }) {
  return ["release", "upload", tag, assetPath, "--repo", repository, "--clobber"];
}

export function main(env = process.env) {
  const reportedPackages = parsePublishedPackages(env.PUBLISHED_PACKAGES || "[]");
  const versionChanges = readVersionChanges(
    requiredEnv(env, "BASE_SHA"),
    requiredEnv(env, "HEAD_SHA")
  );
  const packages = reconcilePublishedPackages(versionChanges, reportedPackages);
  const plan = buildReleasePlan(packages);
  if (plan.tags.length === 0) {
    console.log("No published packages require release finalization.");
    return;
  }

  let generatorRelease;
  if (plan.generator) {
    requiredEnv(env, "GH_TOKEN");
    const repository = requiredEnv(env, "GITHUB_REPOSITORY");
    if (!/^[^/]+\/[^/]+$/u.test(repository)) {
      throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
    }
    const changelog = readFileSync("packages/generator/CHANGELOG.md", "utf8");
    generatorRelease = {
      notes: extractChangelogEntry(changelog, plan.generator.version),
      repository,
      version: plan.generator.version,
    };
  }

  if (!generatorRelease) {
    for (const tag of plan.tags) pushTag(tag);
    console.log("Generator was not published; no GitHub Release will be created.");
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "ps-generator-release-"));
  try {
    const assetPath = createGeneratorArchive(generatorRelease.version, tempDir);
    const notesFile = join(tempDir, "notes.md");
    writeFileSync(notesFile, `${generatorRelease.notes}\n`, "utf8");

    for (const tag of plan.tags) pushTag(tag);
    createGeneratorRelease({ ...generatorRelease, assetPath, notesFile });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readVersionChanges(base, head) {
  const before = {};
  const after = {};
  for (const entry of PACKAGE_MANIFESTS) {
    before[entry.name] = readPackageVersion(base, entry.path);
    after[entry.name] = readPackageVersion(head, entry.path);
  }
  return findVersionChanges(before, after);
}

function readPackageVersion(ref, path) {
  const contents = execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  const parsed = JSON.parse(contents);
  return parsed.version;
}

function pushTag(tag) {
  execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{}`], { stdio: "ignore" });
  execFileSync("git", ["push", "origin", `refs/tags/${tag}:refs/tags/${tag}`], {
    stdio: "inherit",
  });
}

export function createGeneratorArchive(version, tempDir) {
  if (process.platform !== "win32") {
    throw new Error(
      `Generator runtime archives must be built on Windows; received ${process.platform}.`
    );
  }

  const tarballPath = join(tempDir, `generator-${version}.tgz`);
  execFileSync("pnpm", ["--filter", GENERATOR_PACKAGE, "pack", "--out", tarballPath], {
    shell: true,
    stdio: "inherit",
  });
  if (!existsSync(tarballPath) || statSync(tarballPath).size === 0) {
    throw new Error(`Generator npm tarball was not created: ${tarballPath}`);
  }

  const extractDir = join(tempDir, "packed");
  mkdirSync(extractDir);
  const tarCommand = join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe");
  execFileSync(tarCommand, ["-xzf", tarballPath, "-C", extractDir], { stdio: "inherit" });

  const packageDir = join(extractDir, "package");
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Packed Generator tarball does not contain package/package.json.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== GENERATOR_PACKAGE || manifest.version !== version) {
    throw new Error(
      `Packed Generator identity mismatch: expected ${GENERATOR_PACKAGE}@${version}, received ${String(manifest.name)}@${String(manifest.version)}.`
    );
  }

  const assetPath = join(tempDir, generatorAssetName(version));
  execFileSync(tarCommand, ["-a", "-cf", assetPath, "-C", packageDir, "."], {
    stdio: "inherit",
  });
  if (!existsSync(assetPath) || statSync(assetPath).size === 0) {
    throw new Error(`Generator ZIP asset was not created: ${assetPath}`);
  }
  return assetPath;
}

function createGeneratorRelease({ assetPath, notesFile, repository, version }) {
  const tag = `${GENERATOR_PACKAGE}@${version}`;
  const existing = spawnSync("gh", ["release", "view", tag, "--repo", repository], {
    stdio: "ignore",
  });
  if (existing.error) throw existing.error;
  if (existing.status === 0) {
    console.log(`GitHub Release ${tag} already exists; replacing its Generator ZIP asset.`);
    execFileSync("gh", buildGeneratorReleaseUploadArgs({ assetPath, repository, tag }), {
      stdio: "inherit",
    });
    return;
  }

  execFileSync("gh", buildGeneratorReleaseCreateArgs({ assetPath, notesFile, repository, tag }), {
    stdio: "inherit",
  });
}

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
