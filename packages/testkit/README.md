# `@ps-generator-bridge/testkit`

Windows-only CLI smoke harness for PS Generator Bridge plugins. It starts Adobe `generator-core` against the published generator package, verifies the bridge server, checks plugin discovery, and performs an SDK `getServerInfo` smoke call.

## Install

```bash
npm install -D @ps-generator-bridge/testkit
```

In this monorepo:

```bash
pnpm --filter @ps-generator-bridge/testkit build
pnpm --filter @ps-generator-bridge/testkit typecheck
```

## Requirements

- Windows
- Node.js >=18
- Photoshop already running
- Photoshop Generator enabled
- Photoshop Remote Connections enabled
- Git and npm available for installing Adobe `generator-core`

## Commands

```bash
ps-bridge-test setup [--update]
ps-bridge-test run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
ps-bridge-test dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
```

### `setup`

Clones or updates Adobe `generator-core` under:

```text
%LOCALAPPDATA%\ps-bridge-test\generator-core\master
```

It also runs `npm install` in that directory.

### `run`

Starts `generator-core`, waits for `GET /health`, validates `GET /plugins`, runs an SDK `getServerInfo` smoke call, prints the result, and exits.

```bash
ps-bridge-test run --plugin ./my-plugin --expect-plugin myPlugin
```

### `dev`

Starts the same harness and keeps `generator-core` running until interrupted.

```bash
ps-bridge-test dev --plugins-dir ./plugins --port 7700
```

## Plugin Inputs

Use exactly one of:

- `--plugin <dir>` for a single plugin package directory
- `--plugins-dir <dir>` for a directory whose direct children are plugin package directories

`--expect-plugin <id>` can be repeated. The harness fails if any expected id is missing from `/plugins`.

## What the Harness Verifies

1. Photoshop is running.
2. `generator-core` is installed and can start.
3. The generator package can be loaded by `generator-core`.
4. The bridge server becomes healthy.
5. The number of loaded plugins matches the candidate plugin directories.
6. Expected plugin ids are present.
7. The SDK can connect over WebSocket and call `getServerInfo`.

## Limits

This is a smoke harness, not a full integration test framework. It does not drive Photoshop documents or assert plugin-specific UI/workflow behavior. Use package unit tests for deterministic logic and use this CLI to verify the real Photoshop boot path.
