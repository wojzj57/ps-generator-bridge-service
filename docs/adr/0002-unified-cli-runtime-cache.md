# ADR 0002: CLI uses a unified per-user runtime cache

## Status

Accepted. This supersedes the workspace-sensitive cache decision in ADR 0001; ADR 0001 remains as historical context for the earlier CLI migration.

## Decision

The CLI and repository `pnpm setup` use one per-user `ps-generator-bridge` root. Windows uses `%LOCALAPPDATA%`, macOS uses `~/Library/Caches`, and Linux uses `$XDG_CACHE_HOME` with the standard home fallback. The root owns separate `generator-core`, `generator-runtime`, and plugin snapshot directories.

`generator-core` is reused without network access only when its checkout, entry point, package metadata, and dependencies are complete. It is updated only through an explicit core update option. Before startup, the selected generator runtime's `generator-core-version` range must accept the cached core version.

The CLI and `@ps-generator-bridge/generator` are independently versioned. Commands that need a runtime resolve npm's `latest` dist-tag on every invocation, unless `--runtime-version` selects another version or tag. Runtime installation happens in a staging directory and replaces the current cache only after validation. A valid runtime is a standalone Windows x64 package with no unresolved runtime dependencies and a complete package-private sharp vendor payload. A valid cached runtime is an offline fallback for `latest`; an explicit version cannot fall back to a different cached version.

`run` and `dev` keep generator-core's `-f` argument pointed at the cached generator runtime host. A single plugin package is exposed through a managed junction snapshot; `--plugin-cwd` selects the current directory. `--plugins-dir` bypasses the snapshot and passes the selected collection through via `PS_BRIDGE_PLUGINS_DIR`. The old `--expect-plugin` assertion is removed. Smoke validation requires at least the number of distinct candidates known from explicit `PS_BRIDGE_PLUGINS` paths and the selected collection; additional host-configured plugins are allowed.

All shared-cache operations are serialized by a PID-bearing lock. `clean` removes only the marked per-user cache and never moves or deletes legacy workspace checkouts.

## Consequences

- Running from a pnpm workspace behaves the same as running the published CLI.
- Runtime releases can reach existing CLI installations without a coordinated CLI release.
- Startup normally performs one lightweight npm metadata query.
- Offline startup remains possible after a successful runtime installation.
- Concurrent run/dev or cache mutation commands are intentionally rejected.
