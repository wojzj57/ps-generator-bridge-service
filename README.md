# PS Generator Bridge Service

<p align="center">
  <a href="https://wojzj57.github.io/ps-generator-bridge-service/"><img alt="Docs" src="https://img.shields.io/badge/docs-EN-blue" /></a>
  <a href="https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install"><img alt="Docs ZH" src="https://img.shields.io/badge/docs-ZH-blue" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green.svg" /></a>
  <a href="https://pnpm.io/"><img alt="pnpm" src="https://img.shields.io/badge/pnpm-11.5.0-orange.svg" /></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/generator"><img alt="npm generator" src="https://img.shields.io/npm/v/@ps-generator-bridge/generator?label=generator" /></a>
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/sdk"><img alt="npm sdk" src="https://img.shields.io/npm/v/@ps-generator-bridge/sdk?label=sdk" /></a>
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/cli"><img alt="npm cli" src="https://img.shields.io/npm/v/@ps-generator-bridge/cli?label=cli" /></a>
</p>

Documentation: [English](https://wojzj57.github.io/ps-generator-bridge-service/) · [简体中文](https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install)

PS Generator Bridge Service is a monorepo for exposing Photoshop Generator capabilities over a typed WebSocket protocol.

- `@ps-generator-bridge/sdk` is the isomorphic client SDK and the source of truth for the protocol contract.
- `@ps-generator-bridge/generator` is the Photoshop Generator plugin loaded by Adobe `generator-core`.
- `@ps-generator-bridge/cli` provides command-line tools, including a Windows smoke harness for real Photoshop and `generator-core`.

The published generator package has no runtime dependency on the SDK package:
its build aliases and inlines the SDK protocol and plugin-authoring source, while
plugin-facing generator contracts cross back into the SDK as type-only exports.
Keep protocol changes in `packages/sdk/src/protocol/` and `ProtocolMethods`
first, then implement the server behavior in `packages/generator`.

## Packages

| Package              | Role                                                                 | Runtime                          |
| -------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `packages/sdk`       | WebSocket client, protocol types, plugin authoring primitives        | Browser and Node >=18            |
| `packages/generator` | Photoshop Generator plugin, WebSocket server, module and plugin host | Photoshop bundled Node / Node 18 |
| `packages/cli`       | CLI tools and Photoshop + `generator-core` smoke harness             | Windows Node >=18 for run/dev    |

## Requirements

- Node.js >=18
- pnpm 11.5.0
- Photoshop with Generator and Remote Connections enabled for real Photoshop runs
- Windows for `@ps-generator-bridge/cli` run/dev smoke commands

## Install

```bash
pnpm install
pnpm setup
```

`pnpm setup` clones Adobe `generator-core` into `./generator-core`. The directory is ignored by git and is only required for running the generator inside Photoshop.

## Common Commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format
pnpm pack:check
pnpm docs:build
```

Use package filters for focused work:

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/cli typecheck
```

## Development Flow

1. Model protocol capabilities in `packages/sdk/src/protocol/` and `ProtocolMethods`.
2. Expose client-facing helpers in the SDK when the method should be public.
3. Implement server handlers in `packages/generator` modules or built-ins.
4. Add unit tests with injected seams (`FakeTransport`, `FakeGenerator`) before relying on real Photoshop.
5. Use the CLI smoke harness or VSCode launch configs for real Photoshop smoke checks.

## Runtime Overview

The generator package is loaded by `generator-core` through its CommonJS `main.js` entry. During initialization it:

1. Registers a Photoshop Generator menu item.
2. Starts a Fastify HTTP/WebSocket service on `127.0.0.1` (default port `7700`).
3. Loads optional external plugins from `pluginsDir` or `PS_BRIDGE_PLUGINS_DIR`.
4. Registers built-in modules for document, layer, action, image, selection, JSX, and event methods.

The SDK uses `ws://127.0.0.1:7700` as the default service base URL and connects to `/ws`.

## Built-In Capabilities

| Module      | Capability summary                                              |
| ----------- | --------------------------------------------------------------- |
| `action`    | Main-subject selection and background removal.                  |
| `document`  | Active-document metadata, export, and save operations.          |
| `layer`     | Layer lookup, previews, image import, and layer change events.  |
| `image`     | Layer, selected-path, preview, and document image export.       |
| `selection` | Selection watching, bounds, paths, and selection change events. |

See the [built-in capability matrix](./docs/reference/built-in-capabilities.md)
for per-capability SDK, Plugin Host, WebSocket, HTTP API, and MCP availability.
MCP is not implemented in the current version.

## Environment Variables

| Variable                       | Purpose                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `PS_BRIDGE_PORT`               | Overrides the generator WebSocket/HTTP port.                                            |
| `PS_BRIDGE_PLUGINS_DIR`        | Directory of external plugin packages to load.                                          |
| `PS_BRIDGE_LOG_DIR`            | Directory for generator runtime logs.                                                   |
| `PS_BRIDGE_COS_*`              | Enables optional Tencent Cloud COS upload support when all required fields are present. |
| `PS_GENERATOR_REMOTE_PASSWORD` | Remote Connections password used by CLI Photoshop setup/settings, run, and dev.         |

Structured runtime options such as `port` and `pluginsDir` should flow through `PluginConfig`; environment variables are deployment overrides.

## Documentation

- Online documentation: https://wojzj57.github.io/ps-generator-bridge-service/
- Chinese documentation: https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install
- [docs/README.md](./docs/README.md) is the public documentation entry point for GitHub and GitHub Pages.
- [docs/getting-started/install.md](./docs/getting-started/install.md) explains setup and prerequisites.
- [docs/getting-started/run-generator.md](./docs/getting-started/run-generator.md) explains how to run the generator.
- [docs/getting-started/connect-sdk.md](./docs/getting-started/connect-sdk.md) explains how to connect with the SDK.
- [docs/generator/configuration.md](./docs/generator/configuration.md) documents generator configuration.
- [docs/generator/photoshop-setup.md](./docs/generator/photoshop-setup.md) documents Photoshop setup.
- [docs/generator/troubleshooting.md](./docs/generator/troubleshooting.md) covers troubleshooting.
- [docs/plugins/authoring.md](./docs/plugins/authoring.md) documents external plugin authoring.
- [docs/reference/protocol.md](./docs/reference/protocol.md) documents the public protocol contract.
- [docs/reference/built-in-capabilities.md](./docs/reference/built-in-capabilities.md) compares built-in capability access surfaces.
- [docs/reference/environment.md](./docs/reference/environment.md) documents environment variables.
- [docs/reference/package-exports.md](./docs/reference/package-exports.md) documents package export boundaries.
- [CONTEXT.md](./CONTEXT.md) defines the project vocabulary.

Chinese documentation is available in [README_zh.md](./README_zh.md).
The VitePress docs also include [Simplified Chinese](./docs/zh/README.md).
