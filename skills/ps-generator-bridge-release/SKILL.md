---
name: ps-generator-bridge-release
description: Manage the PS Generator Bridge release pipeline. Use when editing .changeset, .github release or changeset-check workflows, package publish metadata, npm package initialization, package versioning, release scripts, changelogs, or testkit-to-cli publishing migration details.
---

# Ps Generator Bridge Release

Use this skill for repository release and publishing work that spans packages.

## Release Model

- Published packages are `@ps-generator-bridge/sdk`, `@ps-generator-bridge/generator`, and `@ps-generator-bridge/cli`.
- The root package is private and only orchestrates workspace commands.
- Changesets owns package versions and changelogs.
- `@ps-generator-bridge/sdk` and `@ps-generator-bridge/generator` are fixed together in `.changeset/config.json`.
- `@ps-generator-bridge/cli` is independent, but internal dependency updates can bump it.
- The old `@ps-generator-bridge/testkit` package is replaced by `@ps-generator-bridge/cli`; do not restore `packages/testkit` or `ps-bridge-test`.

## Workflow Checks

Before changing release behavior:

1. Inspect `.changeset/config.json`, `.github/workflows/release.yml`, `.github/workflows/changeset-check.yml`, root `package.json`, and touched package `package.json` files.
2. Confirm the default branch is `master`; keep Changesets `baseBranch` and workflow branch triggers aligned unless the repository default changes.
3. Confirm publishable package names match workspace packages and docs.
4. Keep `pack:check` covering all published packages.
5. Keep release changes separate from package runtime behavior unless they must land together.

## Changeset Guard

- `.github/workflows/changeset-check.yml` treats `packages/(sdk|generator|cli)/src/` and `packages/generator/jsx/` as publishable surfaces.
- If a new publishable package or generated runtime surface appears, update this guard and `pack:check` together.
- Use the `no-release` label only for changes that genuinely should not publish.

## Versioning

Use the existing scripts:

```bash
pnpm changeset
pnpm version-packages
pnpm pack:check
pnpm release
```

When running a version update, verify package `version`, package changelogs, and internal dependency ranges. Do not invent a release workflow outside Changesets.

## npm Publishing

- Scoped packages must publish with public access. Keep package `publishConfig.access` set to `public`.
- CI publishing needs `NPM_TOKEN` in the release action environment and GitHub repository secrets.
- A first publish of `@ps-generator-bridge/cli` creates the npm package; npm cannot rename `@ps-generator-bridge/testkit`.
- After `@ps-generator-bridge/cli` is published, deprecate old testkit with an explicit migration message.

## Validation

Run focused checks after release-flow edits:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

For npm auth issues, check `npm whoami`, `npm owner ls <published-package>`, registry config, and package maintainers before changing repository files.
