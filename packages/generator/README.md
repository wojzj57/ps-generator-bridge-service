# `@ps-generator-bridge/generator`

Photoshop Generator plugin and WebSocket service for PS Generator Bridge. This package is loaded by Adobe `generator-core` inside Photoshop's bundled Node runtime and exposes Photoshop operations to SDK clients.

Full public documentation lives in the repository docs:

- [Run Generator](../../docs/getting-started/run-generator.md)
- [Configuration](../../docs/generator/configuration.md)
- [Photoshop Setup](../../docs/generator/photoshop-setup.md)
- [Troubleshooting](../../docs/generator/troubleshooting.md)

## Install

```bash
npm install @ps-generator-bridge/generator
```

In this monorepo:

```bash
pnpm --filter @ps-generator-bridge/generator build
pnpm --filter @ps-generator-bridge/generator test
```

## Runtime Role

`generator-core` requires this package through `main.js`, which loads the built CommonJS entry and calls:

```ts
init(generator, config);
```

Initialization:

1. Creates a `PsBridgeHost` around the injected Photoshop Generator API.
2. Registers the "PS Generator Bridge: Server" menu item.
3. Starts the HTTP/WebSocket service, defaulting to port `7700`.
4. Loads external plugin packages from `pluginsDir` or `PS_BRIDGE_PLUGINS_DIR`.
5. Registers built-in modules and plugin-scoped handlers before Fastify starts listening.

## Configuration

```ts
export interface PluginConfig {
  port?: number;
  pluginsDir?: string;
  [key: string]: unknown;
}
```

Environment overrides:

| Variable                | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `PS_BRIDGE_PORT`        | Overrides `PluginConfig.port`.                                                         |
| `PS_BRIDGE_PLUGINS_DIR` | Overrides the default plugin directory when `pluginsDir` is not provided.              |
| `PS_BRIDGE_COS_*`       | Enables optional COS-backed image upload when all required credentials are configured. |

Prefer `PluginConfig` for structured run parameters. Use environment variables for deployment-time overrides and secrets.

## Server Endpoints

| Endpoint           | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `GET /health`      | Liveness probe.                                                                 |
| `GET /plugins`     | Lists loaded external plugin ids.                                               |
| `WS /ws`           | Root SDK protocol endpoint.                                                     |
| `WS /ws/:pluginId` | Plugin-scoped protocol endpoint with scoped-first dispatch and global fallback. |

The first WebSocket frame sent by the server is a `connected` event containing `clientId`. Clients reuse that id through `?id=` on reconnect.

## Built-in Capabilities

The generator registers built-in protocol methods for:

- server info and plugin discovery
- JSX execution (`jsx:run`, `jsx:execute`)
- endpoint-aware event subscription and unsubscription
- action operations
- layer inspection
- document operations
- image export results as JSON-safe `WsImageResult`

Protocol method names and payload types live in `@ps-generator-bridge/sdk`; keep the generator implementation aligned with `packages/sdk/src/protocol.ts`.

## Plugin Host

External plugins are loaded from direct child folders of the plugin directory. Each plugin package needs a `package.json` with a `main` entry and a default export class derived from `BasePlugin`.

The host passed to each plugin exposes narrow capabilities:

- `modules` for built-in layer, document, action, and image APIs
- `events` for Photoshop, main, and plugin-local event subscriptions; plugin
  authors publish plugin-local events with `events.emit(...)`
- `jsx` scoped to the plugin's own `jsx` directory, with access to built-in JSX
- optional `cos` upload support when configured

Do not expose Fastify, generator-core, COS SDK concrete classes, or other server internals to plugin authors. Cross the boundary with the type-only contracts in `src/contract.ts`.

## JSX Resources

Plain ExtendScript resources live under `jsx/` and are shipped as package files. They are not bundled by tsup. `JsxRunner` resolves them from the package tree at runtime and is the single path for `evaluateJSXFile` calls.

## Testing

```bash
pnpm --filter @ps-generator-bridge/generator typecheck
pnpm --filter @ps-generator-bridge/generator test
```

Unit tests use injected seams and do not require Photoshop:

- `FakeGenerator` records generator-core interactions.
- Real local WebSocket servers are used on ephemeral ports.
- Dispatch, registry, decorator, plugin loading, events, and module behavior are tested in process.

See [TESTING.md](./TESTING.md) for scope and coverage rules.
