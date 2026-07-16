import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeneratorReleaseCreateArgs,
  buildGeneratorReleaseUploadArgs,
  buildReleasePlan,
  extractChangelogEntry,
  findVersionChanges,
  generatorAssetName,
  parsePublishedPackages,
  reconcilePublishedPackages,
} from "./finalize-package-releases.mjs";

test("plans tags for every npm package but a GitHub Release only for Generator", () => {
  const packages = parsePublishedPackages(
    JSON.stringify([
      { name: "@ps-generator-bridge/cli", version: "0.4.2" },
      { name: "@ps-generator-bridge/sdk", version: "1.2.0" },
      { name: "@ps-generator-bridge/generator", version: "1.2.0" },
    ])
  );

  assert.deepEqual(buildReleasePlan(packages), {
    tags: [
      "@ps-generator-bridge/cli@0.4.2",
      "@ps-generator-bridge/sdk@1.2.0",
      "@ps-generator-bridge/generator@1.2.0",
    ],
    generator: { name: "@ps-generator-bridge/generator", version: "1.2.0" },
  });
});

test("does not plan a GitHub Release when only CLI and SDK are published", () => {
  const packages = parsePublishedPackages(
    JSON.stringify([
      { name: "@ps-generator-bridge/cli", version: "0.4.2" },
      { name: "@ps-generator-bridge/sdk", version: "1.2.0" },
    ])
  );

  assert.equal(buildReleasePlan(packages).generator, undefined);
});

test("derives release packages from manifest version changes", () => {
  const before = {
    "@ps-generator-bridge/cli": "0.4.1",
    "@ps-generator-bridge/generator": "1.1.1",
    "@ps-generator-bridge/sdk": "1.1.1",
  };
  const after = {
    "@ps-generator-bridge/cli": "0.4.2",
    "@ps-generator-bridge/generator": "1.2.0",
    "@ps-generator-bridge/sdk": "1.2.0",
  };

  assert.deepEqual(findVersionChanges(before, after), [
    { name: "@ps-generator-bridge/cli", version: "0.4.2" },
    { name: "@ps-generator-bridge/generator", version: "1.2.0" },
    { name: "@ps-generator-bridge/sdk", version: "1.2.0" },
  ]);
});

test("uses release commit changes when a recovery publish reports no new packages", () => {
  const changes = [{ name: "@ps-generator-bridge/generator", version: "1.2.0" }];

  assert.deepEqual(reconcilePublishedPackages(changes, []), changes);
  assert.throws(
    () =>
      reconcilePublishedPackages(changes, [
        { name: "@ps-generator-bridge/generator", version: "2.0.0" },
      ]),
    /is not present in the release commit/u
  );
});

test("rejects unknown, duplicate, and invalid published package records", () => {
  assert.throws(
    () => parsePublishedPackages('[{"name":"unknown","version":"1.0.0"}]'),
    /Unexpected published package/u
  );
  assert.throws(
    () =>
      parsePublishedPackages(
        '[{"name":"@ps-generator-bridge/cli","version":"1.0.0"},{"name":"@ps-generator-bridge/cli","version":"1.0.1"}]'
      ),
    /Duplicate published package/u
  );
  assert.throws(
    () => parsePublishedPackages('[{"name":"@ps-generator-bridge/sdk","version":"latest"}]'),
    /Invalid published version/u
  );
});

test("extracts only the requested Generator changelog entry", () => {
  const changelog = `# Generator

## 1.2.0

### Minor Changes

- Add the new runtime.

## 1.1.1

### Patch Changes

- Fix the old runtime.
`;

  assert.equal(
    extractChangelogEntry(changelog, "1.2.0"),
    "### Minor Changes\n\n- Add the new runtime."
  );
  assert.throws(() => extractChangelogEntry(changelog, "2.0.0"), /has no ## 2\.0\.0 entry/u);
});

test("names the Generator ZIP asset from its released version", () => {
  assert.equal(generatorAssetName("1.2.0"), "ps-generator-bridge-1.2.0.zip");
  assert.throws(() => generatorAssetName("latest"), /Invalid Generator asset version/u);
});

test("attaches the Generator ZIP when creating or recovering a GitHub Release", () => {
  const release = {
    assetPath: "C:\\temp\\ps-generator-bridge-1.2.0.zip",
    notesFile: "C:\\temp\\notes.md",
    repository: "owner/repository",
    tag: "@ps-generator-bridge/generator@1.2.0",
  };

  assert.deepEqual(buildGeneratorReleaseCreateArgs(release), [
    "release",
    "create",
    release.tag,
    release.assetPath,
    "--repo",
    release.repository,
    "--verify-tag",
    "--title",
    release.tag,
    "--notes-file",
    release.notesFile,
  ]);
  assert.deepEqual(buildGeneratorReleaseUploadArgs(release), [
    "release",
    "upload",
    release.tag,
    release.assetPath,
    "--repo",
    release.repository,
    "--clobber",
  ]);
});
