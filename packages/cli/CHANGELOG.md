# @ps-generator-bridge/cli

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
