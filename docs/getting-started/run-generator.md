# Run Generator

`@ps-generator-bridge/generator` is loaded by Adobe `generator-core`. It registers a Photoshop menu item, starts a local Fastify HTTP/WebSocket service, loads optional plugins, and registers built-in protocol methods.

## Setup Generator Core

From the repository:

```bash
pnpm setup
pnpm --filter @ps-generator-bridge/generator build
```

`pnpm setup` prepares the shared per-user `generator-core` and latest published generator runtime caches. The runtime exposes the CommonJS `main.js` entry loaded by generator-core.

## Runtime Defaults

- Host: `127.0.0.1`
- Port: `7700`
- Root WebSocket endpoint: `ws://127.0.0.1:7700/ws`
- Plugin WebSocket endpoint: `ws://127.0.0.1:7700/ws/{pluginId}`

## Health Check

When the service is running:

```bash
curl http://127.0.0.1:7700/health
```

Expected response:

```json
{ "status": "ok" }
```

## Plugin Discovery

```bash
curl http://127.0.0.1:7700/plugins
```

Response shape:

```json
{ "plugins": [{ "id": "paint" }] }
```

## Configuration

Pass structured runtime options through `PluginConfig` when embedding the generator. Use environment variables for deployment overrides and secrets.

See [Configuration](../generator/configuration.md) and [Environment](../reference/environment.md).
