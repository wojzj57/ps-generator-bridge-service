import { execFileSync } from "node:child_process";

const packages = [
  {
    name: "@ps-generator-bridge/sdk",
    packageJson: "packages/sdk/package.json",
    changelog: "packages/sdk/CHANGELOG.md",
  },
  {
    name: "@ps-generator-bridge/generator",
    packageJson: "packages/generator/package.json",
    changelog: "packages/generator/CHANGELOG.md",
  },
  {
    name: "@ps-generator-bridge/cli",
    packageJson: "packages/cli/package.json",
    changelog: "packages/cli/CHANGELOG.md",
  },
];

const base = git(["rev-parse", requiredEnv("BASE_SHA")]);
const head = git(["rev-parse", requiredEnv("HEAD_SHA")]);
const isRelease = process.env.IS_RELEASE === "true";
const changedFiles = new Set(
  git(["diff", "--name-only", base, head]).split(/\r?\n/u).filter(Boolean)
);
const pendingChangesets = [...changedFiles].filter((path) =>
  /^\.changeset\/[^/]+\.md$/u.test(path)
);
const versionChanges = packages.map((entry) => {
  const before = readPackageVersion(base, entry.packageJson);
  const after = readPackageVersion(head, entry.packageJson);
  return { ...entry, before, after, changed: before !== after };
});

const errors = [];

if (pendingChangesets.length > 0) {
  errors.push(
    `Changeset files must be consumed with 'pnpm version-packages' before opening a PR: ${pendingChangesets.join(", ")}`
  );
}

if (!isRelease) {
  for (const entry of versionChanges) {
    if (entry.changed) {
      errors.push(
        `${entry.name} changes version from ${entry.before} to ${entry.after}; package versions may only change in a PR labeled 'release'.`
      );
    }
    if (changedFiles.has(entry.changelog)) {
      errors.push(`${entry.changelog} may only change in a PR labeled 'release'.`);
    }
  }
} else {
  const mergeBase = git(["merge-base", base, head]);
  if (mergeBase !== base) {
    errors.push(
      "A release PR must contain the current master tip. Update the release branch from master and rerun version preparation."
    );
  }

  const allowedReleaseFiles = new Set([
    "pnpm-lock.yaml",
    ...packages.flatMap((entry) => [entry.packageJson, entry.changelog]),
  ]);
  const unexpectedFiles = [...changedFiles].filter((path) => !allowedReleaseFiles.has(path));
  if (unexpectedFiles.length > 0) {
    errors.push(
      `A release PR may only contain generated package versions, changelogs, and pnpm-lock.yaml: ${unexpectedFiles.join(", ")}`
    );
  }

  const bumped = versionChanges.filter((entry) => entry.changed);
  if (bumped.length === 0) {
    errors.push("A PR labeled 'release' must bump at least one publishable package version.");
  }

  for (const entry of bumped) {
    if (compareVersions(entry.after, entry.before) <= 0) {
      errors.push(`${entry.name} must increase from ${entry.before}; received ${entry.after}.`);
    }
    if (!changedFiles.has(entry.changelog)) {
      errors.push(`${entry.name} changes version but does not update ${entry.changelog}.`);
    }
  }

  for (const entry of versionChanges.filter((candidate) => !candidate.changed)) {
    if (changedFiles.has(entry.changelog)) {
      errors.push(`${entry.changelog} changes without a matching ${entry.name} version bump.`);
    }
  }

  const sdk = versionChanges.find((entry) => entry.name.endsWith("/sdk"));
  const generator = versionChanges.find((entry) => entry.name.endsWith("/generator"));
  if (!sdk || !generator) throw new Error("Fixed package configuration is incomplete.");
  if (sdk.after !== generator.after || sdk.changed !== generator.changed) {
    errors.push(
      "@ps-generator-bridge/sdk and @ps-generator-bridge/generator must be released together at the same version."
    );
  }
}

if (errors.length > 0) {
  console.error("Release intent validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  isRelease
    ? "Release PR intent is valid."
    : "Regular PR intent is valid; no package versions or changelogs are being released."
);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readPackageVersion(ref, path) {
  const contents = git(["show", `${ref}:${path}`]);
  const parsed = JSON.parse(contents);
  if (typeof parsed.version !== "string") {
    throw new Error(`${path} at ${ref} does not contain a string version.`);
  }
  parseVersion(parsed.version);
  return parsed.version;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(version);
  if (!match) throw new Error(`Unsupported semantic version: ${version}`);
  return match.slice(1, 4).map(Number);
}
