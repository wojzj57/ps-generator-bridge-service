# `@ps-generator-bridge/cli`

Command-line tools for PS Generator Bridge. The current commands are a Windows-only smoke harness for PS Generator Bridge plugins: they start Adobe `generator-core` against the published generator package, verify the bridge server, check plugin discovery, and perform an SDK `getServerInfo` smoke call.

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

Related public docs:

- [Photoshop Setup](../../docs/generator/photoshop-setup.md)
- [Troubleshooting](../../docs/generator/troubleshooting.md)

## Install

```bash
npm install -D @ps-generator-bridge/cli
```

In this monorepo:

```bash
pnpm --filter @ps-generator-bridge/cli build
pnpm --filter @ps-generator-bridge/cli typecheck
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
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
ps-generator-bridge dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
```

### `setup-core`

Clones or updates Adobe `generator-core` and runs `npm install`.

When run inside a pnpm workspace, `generator-core` is stored at:

```text
<workspace-root>/generator-core
```

Outside a pnpm workspace, it falls back to:

```text
<system-temp>/ps-generator-bridge/generator-core
```

### `run`

Starts `generator-core`, waits for `GET /health`, validates `GET /plugins`, runs an SDK `getServerInfo` smoke call, prints the result, and exits.

```bash
ps-generator-bridge run --plugin ./my-plugin --expect-plugin myPlugin
```

### `dev`

Starts the same harness and keeps `generator-core` running until interrupted.

```bash
ps-generator-bridge dev --plugins-dir ./plugins --port 7700
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

This CLI does not expose a public import API. The current smoke harness is not a full integration test framework; it does not drive Photoshop documents or assert plugin-specific UI/workflow behavior. Use package unit tests for deterministic logic and use this CLI to verify the real Photoshop boot path.
