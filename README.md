# PS Generator Bridge Service

[![Docs](https://img.shields.io/badge/docs-online-blue)](https://wojzj57.github.io/ps-generator-bridge-service/)

Documentation: https://wojzj57.github.io/ps-generator-bridge-service/
Chinese documentation: https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install

PS Generator Bridge Service is a monorepo for exposing Photoshop Generator capabilities over a typed WebSocket protocol.

- `@ps-generator-bridge/sdk` is the isomorphic client SDK and the source of truth for the protocol contract.
- `@ps-generator-bridge/generator` is the Photoshop Generator plugin loaded by Adobe `generator-core`.
- `@ps-generator-bridge/testkit` is a Windows smoke harness for real Photoshop and `generator-core`.

The generator package depends on the SDK contract type-only. Keep protocol changes in `packages/sdk/src/protocol.ts` first, then implement the server behavior in `packages/generator`.

## Packages

| Package              | Role                                                                 | Runtime                          |
| -------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `packages/sdk`       | WebSocket client, protocol types, plugin authoring primitives        | Browser and Node >=18            |
| `packages/generator` | Photoshop Generator plugin, WebSocket server, module and plugin host | Photoshop bundled Node / Node 18 |
| `packages/testkit`   | CLI smoke harness for Photoshop + `generator-core`                   | Windows Node >=18                |

## Requirements

- Node.js >=18
- pnpm 11.5.0
- Photoshop with Generator and Remote Connections enabled for real Photoshop runs
- Windows for `@ps-generator-bridge/testkit`

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
```

Use package filters for focused work:

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/testkit typecheck
```

## Development Flow

1. Model protocol capabilities in `packages/sdk/src/protocol.ts`.
2. Expose client-facing helpers in the SDK when the method should be public.
3. Implement server handlers in `packages/generator` modules or built-ins.
4. Add unit tests with injected seams (`FakeTransport`, `FakeGenerator`) before relying on real Photoshop.
5. Use the testkit or VSCode launch configs for real Photoshop smoke checks.

## Runtime Overview

The generator package is loaded by `generator-core` through its CommonJS `main.js` entry. During initialization it:

1. Registers a Photoshop Generator menu item.
2. Starts a Fastify WebSocket service on `127.0.0.1` (default port `7700`).
3. Loads optional external plugins from `pluginsDir` or `PS_BRIDGE_PLUGINS_DIR`.
4. Registers built-in modules for document, layer, action, image, JSX, and event methods.

The SDK uses `ws://127.0.0.1:7700` as the default service base URL and connects to `/ws`.

## Environment Variables

| Variable                | Purpose                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `PS_BRIDGE_PORT`        | Overrides the generator WebSocket/HTTP port.                                            |
| `PS_BRIDGE_PLUGINS_DIR` | Directory of external plugin packages to load.                                          |
| `PS_BRIDGE_COS_*`       | Enables optional Tencent Cloud COS upload support when all required fields are present. |

Structured runtime options such as `port` and `pluginsDir` should flow through `PluginConfig`; environment variables are deployment overrides.

## Documentation

- Online documentation: https://wojzj57.github.io/ps-generator-bridge-service/
- Chinese documentation: https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install
- [docs/README.md](./docs/README.md) is the public documentation entry point for GitHub and GitHub Pages.
- [docs/getting-started/install.md](./docs/getting-started/install.md) explains setup and prerequisites.
- [docs/sdk/connection.md](./docs/sdk/connection.md) documents the SDK connection facade.
- [docs/plugins/authoring.md](./docs/plugins/authoring.md) documents external plugin authoring.
- [docs/reference/protocol.md](./docs/reference/protocol.md) documents the public protocol contract.
- [CONTEXT.md](./CONTEXT.md) defines the project vocabulary.

Chinese documentation is available in [README_zh.md](./README_zh.md).
The VitePress docs also include [Simplified Chinese](./docs/zh/README.md).
