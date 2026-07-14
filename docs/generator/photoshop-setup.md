# Photoshop Setup

Real Photoshop runs use Adobe `generator-core`. The repository setup script prepares core and the latest published generator runtime in the same per-user cache used by the CLI.

```bash
pnpm setup
```

## Photoshop Requirements

- Photoshop installed
- Generator enabled
- Remote Connections enabled
- A published generator runtime available in the shared CLI cache

## Install Into Photoshop

Users can install the published generator runtime into a local Photoshop install without cloning this repository:

```bash
pnpm dlx @ps-generator-bridge/cli setup-photoshop
```

Close Photoshop before running the command. It discovers installed versions from the Windows registry, asks which version to configure, and installs the plugin into `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`. It then parses the current user's existing `MachinePrefs.psp`, enables Generator and Remote Connections, and configures the Remote Connections password. Only `generatorEnabled`, `srvE`, and `srvK` are changed. The file is atomically replaced without creating a backup. If the settings file does not exist yet, the runtime is still installed; open Photoshop once, close it, and rerun the command with the same password option or environment variable.

Updating a managed runtime preserves its `.env`, logs, plugins, and other user-owned files. Replacing an unmanaged target requires interactive confirmation or `--yes`. Restart Photoshop after setup completes.

The CLI and runtime are versioned independently. `setup` and `setup-photoshop` resolve npm's `latest` runtime on every invocation and share the per-user runtime cache with `run` and `dev`. A valid cache provides an offline fallback; pass `--runtime-version <version-or-tag>` to pin or roll back. Adobe `generator-core` is cached separately and is updated only with `setup-core --update` or `run`/`dev --update-core`.

## Configure An Explicit Preferences File

Use the standalone settings command when the `MachinePrefs.psp` path is already known:

```bash
ps-generator-bridge setup-generator-settings --pref "C:\path\to\MachinePrefs.psp"
ps-generator-bridge setup-generator-settings -pref "C:\path\to\MachinePrefs.psp" --password custom12
```

This command does not discover Photoshop, access the registry, or install a runtime. Photoshop must be closed. The path must identify an existing regular file named `MachinePrefs.psp` and must not be a symbolic link. It updates `generatorEnabled`, `srvE`, and `srvK` together without changing `srvN`, inserting missing fields, or creating a backup.

`setup-photoshop`, `setup-generator-settings`, `run`, and `dev` use `--password`, then `PS_GENERATOR_REMOTE_PASSWORD`, then the default `password`. Passwords must contain 6-128 visible, non-whitespace Unicode characters, cannot contain control characters, and cannot start with `--`. The CLI does not print passwords, but `generator-core` receives the password through its local `-P` process argument.

## Local Development Flow

```bash
pnpm install
pnpm setup
pnpm --filter @ps-generator-bridge/generator build
```

The package build is used for local type checks and tests. CLI `run` and `dev` deliberately load the selected published runtime from the shared cache rather than the workspace build. That runtime is loaded through its CommonJS `main.js` entry; `init(generator, config)` constructs `PsBridgeHost`, registers the menu item, loads plugins, registers modules, initializes JSX polyfills, and starts the service.

## Smoke Harness

Use `@ps-generator-bridge/cli` on Windows to verify the real Photoshop boot path:

```bash
ps-generator-bridge setup-core
ps-generator-bridge run --plugin ./my-plugin
```

The harness waits for `/health`, checks `/plugins`, and runs an SDK `getServerInfo` call. Use `--plugin-cwd` from a plugin project, or `--plugins-dir` to pass a plugin collection through directly. The CLI checks npm `latest` on every run; `--runtime-version` pins a version or tag.
