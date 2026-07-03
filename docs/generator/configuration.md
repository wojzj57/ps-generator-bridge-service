# Generator Configuration

The generator accepts structured runtime options through `PluginConfig` and deployment overrides through environment variables.

## PluginConfig

```ts
export interface PluginConfig {
  port?: number;
  pluginsDir?: string;
  [key: string]: unknown;
}
```

`port` controls the HTTP/WebSocket service port. `pluginsDir` points to a directory whose direct child folders are plugin packages.

## Defaults

| Setting          | Default                  |
| ---------------- | ------------------------ |
| Host             | `127.0.0.1`              |
| Port             | `7700`                   |
| Root WebSocket   | `/ws`                    |
| Plugin WebSocket | `/ws/{pluginId}`         |
| Plugin directory | package-local `plugins/` |

## Environment Overrides

Environment variables are deployment knobs:

| Variable                    | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `PS_BRIDGE_PORT`            | Overrides the configured port when valid.                                 |
| `PS_BRIDGE_PLUGINS_DIR`     | Overrides the default plugin directory when `pluginsDir` is not provided. |
| `PS_BRIDGE_COS_SECRET_ID`   | Required for COS upload support.                                          |
| `PS_BRIDGE_COS_SECRET_KEY`  | Required for COS upload support.                                          |
| `PS_BRIDGE_COS_BUCKET`      | Required for COS upload support.                                          |
| `PS_BRIDGE_COS_REGION`      | Required for COS upload support.                                          |
| `PS_BRIDGE_COS_KEY_PREFIX`  | Optional object key prefix, default `ps-bridge/exports`.                  |
| `PS_BRIDGE_COS_URL_EXPIRES` | Optional signed URL lifetime in seconds, default `315360000`.             |

COS upload support is enabled only when all four required COS fields are present and non-empty.
