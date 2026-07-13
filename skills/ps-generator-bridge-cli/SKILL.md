---
name: ps-generator-bridge-cli
description: Work on the PS Generator Bridge CLI package. Use when editing packages/cli, the published @ps-generator-bridge/cli package, the ps-generator-bridge binary, Windows Photoshop/generator-core smoke harness behavior, plugin directory preparation, Photoshop process checks, generator-core setup/update logic, or future CLI command boundaries.
---

# PS Generator Bridge CLI

Use this skill for changes in `packages/cli`.

## Scope

The CLI is the command-line surface for PS Generator Bridge. Its current run/dev commands are a Windows-only smoke harness that verifies the real boot path:

- Photoshop is already running.
- Adobe `generator-core` is installed under the nearest pnpm workspace root at `generator-core/`, or under the platform's stable per-user cache directory at `ps-generator-bridge/generator-core`.
- `generator-core` can load `@ps-generator-bridge/generator`.
- The bridge server responds on `/health` and `/plugins`.
- The SDK can connect over WebSocket and call `getServerInfo`.

The smoke harness is not a full Photoshop workflow automation framework. It replaces the old `@ps-generator-bridge/testkit` entrypoint; do not reintroduce a `testkit` package or `ps-bridge-test` binary unless a new compatibility decision is made.

## CLI Contract

Preserve these commands:

```bash
ps-generator-bridge setup [--dir <dir>]
ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>]
ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge clean
```

- `setup` installs a minimal generator runtime and preserves user-owned files when updating a managed target.
- `setup-photoshop` discovers Windows Photoshop installations, installs the runtime, and updates existing Generator/Remote Connections preferences.
- `setup-generator-settings` updates only an explicitly selected `MachinePrefs.psp` file.
- `setup-core` clones or updates generator-core and runs `npm install`.
- `run` starts generator-core, verifies bridge readiness, prints results, and exits.
- `dev` starts the same harness and waits for interrupt.
- `clean` removes only the per-user cached generator-core clone; it leaves workspace-managed clones alone.
- `--plugin` and `--plugins-dir` are mutually exclusive.
- `--expect-plugin` may be repeated.
- Photoshop setup/settings and harness password resolution use `--password`, then `PS_GENERATOR_REMOTE_PASSWORD`, then the default `password`.

## Package Contract

- Publish this package as `@ps-generator-bridge/cli` with binary `ps-generator-bridge`.
- Keep `publishConfig.access` public.
- Do not expose importable harness APIs unless a separate public API decision is made.
- Keep root release and pack checks pointed at `@ps-generator-bridge/cli`, not the removed testkit package.
- If touching publishable CLI source, ensure the changeset guard treats `packages/cli/src/` as publishable.

## Implementation Rules

- Keep Windows checks explicit for run/dev. Fail early on non-Windows platforms.
- Avoid assuming Photoshop can be launched by the harness; it should check that Photoshop is already running.
- Keep child process cleanup reliable. On Windows, terminate the process tree.
- Keep plugin preparation and cleanup isolated in `pluginDirs.ts`.
- Use the SDK `Connection` for smoke calls and inject `ws` for Node runtimes without global WebSocket.
- Use `GET /health`, `GET /plugins`, and SDK `getServerInfo` as the boot-path contract. Do not add Photoshop document workflow assertions to ordinary smoke checks.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/cli typecheck
pnpm --filter @ps-generator-bridge/cli test
```

The package test runs Vitest unit tests. Real smoke behavior requires Windows and Photoshop, so do not make ordinary CI depend on it.
