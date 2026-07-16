# @ps-generator-bridge/cli

## 0.4.1

### Patch Changes

- Fixes

  1. Accept npm-installed Generator runtimes by package identity and loadable entry point instead of rejecting `generator@1.1.1` based on resolved version metadata or its internal `vendor`/`native` payload layout.

## 0.4.0

### Minor Changes

- Features

  1. Install, validate, pin, and safely replace standalone Windows x64 generator runtime packages through the shared cache, rejecting legacy dependency-based or incomplete native caches before launch.
  2. Include ordered `PS_BRIDGE_PLUGINS` candidates in `run` and `dev` smoke validation while allowing additional host-configured plugins.

  Documentation

  1. Document standalone runtime caching, version selection, offline fallback, and explicit plugin source validation in the public English and Chinese guides.

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/sdk@1.0.0

## 0.3.0

### Minor Changes

- Breaking Changes

  - Remove the CLI `--expect-plugin` option because the harness now validates discovered and loaded plugin counts automatically.

  Features

  1. Add a serialized per-user cache with independent generator runtime selection, staged updates, offline fallback, and automatic stale-lock recovery.
  2. Add `--plugin-cwd`, direct `--plugins-dir` pass-through, and `--runtime-version` pinning or rollback for setup and harness commands.

  Fixes

  1. Preserve CLI-managed plugin snapshots through symlinks and Windows junctions so the generator loads the selected package without exposing sibling directories.

  Documentation

  1. Document the shared cache layout, locking, offline fallback, cleanup guarantees, and runtime options in the English and Chinese CLI guides.

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/sdk@0.6.0

## 0.2.0

### Minor Changes

- Features

  1. Add `setup` to install a self-contained Generator runtime while preserving user-owned configuration, logs, and plugins during managed updates.
  2. Add `setup-photoshop` to discover Windows Photoshop installations, install the runtime safely, and atomically enable Generator and Remote Connections in existing preferences.
  3. Add `setup-generator-settings` and shared `--password` or `PS_GENERATOR_REMOTE_PASSWORD` handling for setup, run, and development workflows.

  Documentation

  1. Document the new installation, Photoshop configuration, password, overwrite-safety, and recovery workflows in English and Chinese.

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/generator@0.5.0
  - @ps-generator-bridge/sdk@0.5.0

## 0.1.6

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/generator@0.4.0
  - @ps-generator-bridge/sdk@0.4.0

## 0.1.5

### Patch Changes

- Add a `clean` command and make `generator-core` setup faster and more predictable.

  - Add `ps-generator-bridge clean`, which removes the cached `generator-core` clone but refuses to touch the workspace copy managed by `pnpm setup`
  - Store the non-workspace `generator-core` clone in a stable per-user cache directory instead of the system temp directory
  - Skip `npm install` when `generator-core/node_modules` already exists; pass `--update` to refresh
  - Fix the smoke harness to pass the service base URL to `Connection`, which now appends the `/ws` path itself

## 0.1.4

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/generator@0.3.0
  - @ps-generator-bridge/sdk@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/generator@0.2.0
  - @ps-generator-bridge/sdk@0.2.0

## 0.1.2

### Patch Changes

- Harden public Connection event handling for direct WebSocket access.
- Updated dependencies
  - @ps-generator-bridge/sdk@0.1.2
  - @ps-generator-bridge/generator@0.1.2

## 0.1.1

### Patch Changes

- Run the Photoshop process check without a shell wrapper.
  - @ps-generator-bridge/sdk@0.1.1
  - @ps-generator-bridge/generator@0.1.1
