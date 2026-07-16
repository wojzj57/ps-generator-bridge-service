# `@ps-generator-bridge/cli`

Command-line tools for installing the Photoshop Generator runtime, configuring Photoshop on Windows, and running the real Photoshop + `generator-core` smoke harness.

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

## Requirements

- Node.js >=18
- `setup-photoshop`, `setup-generator-settings`, `run`, and `dev` require Windows
- npm is required for the first generator runtime install and later updates; a complete cache supports offline fallback
- Git and npm are required when the shared `generator-core` cache must be created or updated
- `run` and `dev` require Photoshop running with Generator and Remote Connections enabled

## Commands

```text
ps-generator-bridge setup [--dir <dir>] [--runtime-version <version-or-tag>]
ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>] [--runtime-version <version-or-tag>]
ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <version-or-tag>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge dev (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <version-or-tag>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge clean
```

All commands that use the shared cache are serialized. A second command fails with the PID and command of the active owner; stale locks from dead processes are reclaimed automatically.

## Shared Cache

The CLI, including this repository's `pnpm setup`, uses one per-user cache:

| Platform | Root                                                              |
| -------- | ----------------------------------------------------------------- |
| Windows  | `%LOCALAPPDATA%\ps-generator-bridge`                              |
| macOS    | `~/Library/Caches/ps-generator-bridge`                            |
| Linux    | `$XDG_CACHE_HOME/ps-generator-bridge`, falling back to `~/.cache` |

The root contains:

```text
ps-generator-bridge/
├── generator-core/
├── generator-runtime/
│   └── node_modules/@ps-generator-bridge/generator/
└── plugins/
```

Legacy `<workspace-root>/generator-core` checkouts are ignored and never moved or deleted automatically.

### Runtime versions

The CLI and generator runtime have independent versions. `setup`, `setup-photoshop`, `run`, and `dev` query the npm `latest` dist-tag on every invocation and update the shared runtime only when the resolved version changes. Installation is staged and validated before replacing the current cache. Valid runtimes are standalone Windows x64 packages with no unresolved runtime dependencies and a complete package-private sharp vendor payload; legacy dependency-based caches are rejected.

If npm is unavailable, a valid cached runtime is used with a warning. A first install without npm fails. If an update fails, the previous valid runtime is preserved. Pass `--runtime-version <version-or-tag>` to pin or roll back; an explicit request is never replaced by a different cached version.

### `generator-core`

`setup-core` creates the shared core checkout. A cache is reused without network access only when `.git`, `app.js`, `package.json`, and `node_modules` are present. Pass `--update` to pull and reinstall it. `run` and `dev` expose the same behavior through `--update-core`.

The generator runtime's `generator-core-version` range is checked before startup. An incompatible cache stops startup and asks for `--update-core`; core is never updated silently.

## Runtime installation

`setup` installs the selected runtime into `./generator-bridge` by default. Pass `--dir` to choose another location:

```powershell
ps-generator-bridge setup --dir D:\Tools\generator-bridge
ps-generator-bridge setup --dir D:\Tools\generator-bridge --runtime-version 0.6.0
```

Re-running `setup` replaces only installer-managed runtime files. It preserves `.env`, `logs/`, `plugins/`, and other user-owned files. A non-empty unmanaged directory is never replaced.

`setup-photoshop` discovers installed Photoshop versions, installs the selected runtime into `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`, and updates the current user's existing `MachinePrefs.psp`. Photoshop must be closed. Replacing an unmanaged target requires interactive confirmation or `--yes`.

```powershell
ps-generator-bridge setup-photoshop --version 2025 --yes
ps-generator-bridge setup-photoshop --version 2025 --runtime-version latest
```

`setup-generator-settings` changes only `generatorEnabled`, `srvE`, and `srvK` in an explicitly selected existing preferences file. It does not discover Photoshop or install a runtime.

## Remote Connections password

`setup-photoshop`, `setup-generator-settings`, `run`, and `dev` resolve the password in this order:

1. `--password <value>`
2. `PS_GENERATOR_REMOTE_PASSWORD`
3. `password`

Passwords must contain 6-128 visible, non-whitespace Unicode characters, cannot contain control characters, and cannot start with `--`. The CLI does not log the password, but `generator-core` receives it through its local `-P` process argument.

## Run and dev

`run` starts `generator-core`, validates health and plugin discovery, performs an SDK `getServerInfo` smoke call, prints the result, and exits. `dev` performs the same checks and keeps the process running until interrupted.

Exactly one plugin source is required:

- `--plugin <dir>` links one package into the managed snapshot directory
- `--plugin-cwd` is equivalent to `--plugin <current-working-directory>`
- `--plugins-dir <dir>` passes an existing collection directory directly through without modifying it

On Windows, single-plugin sources use a directory junction under the shared `plugins` directory. The snapshot is replaced at startup and its link is removed on normal exit. A marker protects non-CLI directories from deletion. Plugin sources inside the managed snapshot are rejected.

```powershell
ps-generator-bridge run --plugin .\my-plugin --password custom12
Set-Location .\my-plugin
ps-generator-bridge dev --plugin-cwd --port 7700
ps-generator-bridge dev --plugins-dir D:\plugins --runtime-version 0.6.0
```

The harness verifies that the host loaded at least the number of distinct
candidates known from the selected source and `PS_BRIDGE_PLUGINS`. Additional
host-configured plugins are allowed. The removed `--expect-plugin` option is not
supported.

## Clean

`clean` removes the complete CLI-managed cache root, including core, runtime, plugin snapshots, and stale installation artifacts. It refuses to run while another shared-cache command is active and never touches a legacy workspace checkout.

This package does not expose a public import API. The smoke harness validates the real Photoshop boot path; it is not a full Photoshop workflow automation framework.
