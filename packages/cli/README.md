# `@ps-generator-bridge/cli`

Command-line tools for PS Generator Bridge. The CLI can install the minimal Photoshop Generator runtime, configure a local Photoshop install on Windows, and run the Windows-only `generator-core` smoke harness.

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

Related public docs:

- [Photoshop Setup](../../docs/generator/photoshop-setup.md)
- [Troubleshooting](../../docs/generator/troubleshooting.md)

## Install

You can run the published CLI without installing it into your project:

```bash
pnpm dlx @ps-generator-bridge/cli setup
pnpm dlx @ps-generator-bridge/cli setup-photoshop
```

For local development, install it as a dev dependency:

```bash
npm install -D @ps-generator-bridge/cli
```

In this monorepo:

```bash
pnpm --filter @ps-generator-bridge/cli build
pnpm --filter @ps-generator-bridge/cli typecheck
```

## Requirements

- Node.js >=18
- `setup-photoshop`, `setup-generator-settings`, `run`, and `dev` require Windows
- `setup` and `setup-photoshop` require npm to install generator runtime dependencies
- `run` and `dev` require Photoshop already running, Generator enabled, Remote Connections enabled, and Git/npm available for installing Adobe `generator-core`

## Commands

```bash
ps-generator-bridge setup [--dir <dir>]
ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>]
ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge clean
```

### `setup`

Installs the minimal generator runtime into `./generator-bridge` by default. Pass `--dir` to choose another location.

```bash
ps-generator-bridge setup --dir D:\Tools\generator-bridge
```

The installed runtime contains `dist`, `jsx`, `node_modules`, `main.js`, `.env.example`, `CHANGELOG.md`, `package.json`, `README.md`, and `README_zh.md`.

Re-running `setup` against a runtime previously installed by this CLI replaces only installer-managed files. It preserves package-local `.env`, `logs/`, `plugins/`, and other user-owned files. A non-empty directory that is not a managed runtime is never replaced by `setup`.

### `setup-photoshop`

Finds installed Photoshop versions from the Windows registry, asks which one to configure, installs the generator runtime, and updates that user's existing `MachinePrefs.psp` in place. Photoshop must be closed before this command runs.

```bash
ps-generator-bridge setup-photoshop
ps-generator-bridge setup-photoshop --version 2025 --yes
ps-generator-bridge setup-photoshop --version 2025 --password custom12
```

The plugin is installed at:

```text
<Photoshop install dir>\Plug-ins\Generator\generator-bridge
```

Updating a runtime previously installed by this CLI preserves package-local `.env`, `logs/`, `plugins/`, and other user-owned files. If the target `generator-bridge` directory contains files not managed by this CLI, the command asks before replacing it; `--yes` authorizes that replacement without prompting.

The command parses `MachinePrefs.psp` and changes only `generatorEnabled`, `srvE`, and `srvK`. This enables Generator and Remote Connections and sets the Remote Connections password used by this CLI to connect Adobe `generator-core`. The file is validated in memory and atomically replaced without creating a backup. If Photoshop has never created the settings file, the runtime is still installed; open Photoshop once, close it completely, and rerun the command with the same password option or environment variable. A complete preference file is never copied over the user's settings.

### `setup-generator-settings`

Updates an explicitly selected `MachinePrefs.psp` without discovering Photoshop, reading the registry, or installing the generator runtime. Photoshop must be completely closed. The target must already exist, must be a regular file rather than a symbolic link, and its filename must be `MachinePrefs.psp` (case-insensitive).

```bash
ps-generator-bridge setup-generator-settings --pref "C:\Users\me\AppData\Roaming\Adobe\Adobe Photoshop 2025\Adobe Photoshop 2025 Settings\MachinePrefs.psp"
ps-generator-bridge setup-generator-settings -pref "C:\settings\MachinePrefs.psp" --password custom12
```

The command atomically updates `generatorEnabled`, `srvE`, and `srvK` together. It does not change `srvN`, insert missing fields, or create a backup. An already configured file is a successful no-op.

### Remote Connections Password

`setup-photoshop`, `setup-generator-settings`, `run`, and `dev` resolve the password in this order:

1. `--password <value>`
2. `PS_GENERATOR_REMOTE_PASSWORD`
3. `password`

Passwords must contain 6-128 visible, non-whitespace Unicode characters, cannot contain control characters, and cannot start with `--`. The CLI never logs the password. Adobe `generator-core` receives it through its `-P` process argument, so it may still be visible to local process-inspection tools.

### `setup-core`

Clones or updates Adobe `generator-core`, then runs `npm install`. The install is skipped when `node_modules` already exists; pass `--update` to pull the latest `generator-core` and force a fresh install.

When run inside a pnpm workspace, `generator-core` is stored at:

```text
<workspace-root>/generator-core
```

Outside a pnpm workspace, it falls back to a stable per-user cache directory under `ps-generator-bridge/generator-core`:

- Windows: `%LOCALAPPDATA%\ps-generator-bridge\generator-core`
- macOS: `~/Library/Caches/ps-generator-bridge/generator-core`
- Linux: `$XDG_CACHE_HOME/ps-generator-bridge/generator-core` (falling back to `~/.cache`)

### `run`

Starts `generator-core`, waits for `GET /health`, validates `GET /plugins`, runs an SDK `getServerInfo` smoke call, prints the result, and exits.

```bash
ps-generator-bridge run --plugin ./my-plugin --expect-plugin myPlugin --password custom12
```

### `dev`

Starts the same harness and keeps `generator-core` running until interrupted.

```powershell
$env:PS_GENERATOR_REMOTE_PASSWORD="custom12"
ps-generator-bridge dev --plugins-dir ./plugins --port 7700
```

### `clean`

Removes the cached `generator-core` clone from the per-user cache directory. When run inside a pnpm workspace it does nothing, because the workspace copy is managed by `pnpm setup`.

```bash
ps-generator-bridge clean
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
