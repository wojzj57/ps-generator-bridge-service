---
name: ps-generator-bridge-testkit
description: Work on the PS Generator Bridge testkit package. Use when editing packages/testkit, the ps-bridge-test CLI, Windows Photoshop/generator-core smoke harness behavior, plugin directory preparation, Photoshop process checks, or generator-core setup/update logic.
---

# PS Generator Bridge Testkit

Use this skill for changes in `packages/testkit`.

## Scope

The testkit is a Windows-only smoke harness. It verifies the real boot path:

- Photoshop is already running.
- Adobe `generator-core` is installed under `%LOCALAPPDATA%\ps-bridge-test\generator-core\master`.
- `generator-core` can load `@ps-generator-bridge/generator`.
- The bridge server responds on `/health` and `/plugins`.
- The SDK can connect over WebSocket and call `getServerInfo`.

It is not a full Photoshop workflow automation framework.

## CLI Contract

Preserve these commands:

```bash
ps-bridge-test setup [--update]
ps-bridge-test run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
ps-bridge-test dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
```

- `setup` clones or updates generator-core and runs `npm install`.
- `run` starts generator-core, verifies bridge readiness, prints results, and exits.
- `dev` starts the same harness and waits for interrupt.
- `--plugin` and `--plugins-dir` are mutually exclusive.
- `--expect-plugin` may be repeated.

## Implementation Rules

- Keep Windows checks explicit. Fail early on non-Windows platforms.
- Avoid assuming Photoshop can be launched by the harness; it should check that Photoshop is already running.
- Keep child process cleanup reliable. On Windows, terminate the process tree.
- Keep plugin preparation and cleanup isolated in `pluginDirs.ts`.
- Use the SDK `Connection` for smoke calls and inject `ws` for Node runtimes without global WebSocket.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/testkit typecheck
pnpm --filter @ps-generator-bridge/testkit test
```

The package test currently maps to typecheck. Real smoke behavior requires Windows and Photoshop, so do not make ordinary CI depend on it.
