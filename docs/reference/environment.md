# Environment Reference

Environment variables are deployment-time overrides. Structured runtime parameters should usually be passed through `PluginConfig`.

The generator entry `packages/generator/main.js` loads the package-local `.env`
file before requiring the bundled host code. Use that file for local Photoshop
Generator launches; existing process environment variables are not overwritten.

| Variable                          | Required | Purpose                                              | Default                  |
| --------------------------------- | -------- | ---------------------------------------------------- | ------------------------ |
| `PS_BRIDGE_PORT`                  | No       | Overrides the generator service port when valid.     | `7700`                   |
| `PS_BRIDGE_PLUGINS_DIR`           | No       | Directory whose direct children are plugin packages. | package-local `plugins/` |
| `PS_BRIDGE_LOG_DIR`               | No       | Directory for generator runtime logs.                | package-local `logs/`    |
| `PS_BRIDGE_SESSION_RESUME_TTL_MS` | No       | Unexpected-disconnect resume TTL in milliseconds.    | `1800000`                |
| `PS_BRIDGE_COS_SECRET_ID`         | COS only | Tencent Cloud COS secret id.                         | none                     |
| `PS_BRIDGE_COS_SECRET_KEY`        | COS only | Tencent Cloud COS secret key.                        | none                     |
| `PS_BRIDGE_COS_BUCKET`            | COS only | Tencent Cloud COS bucket.                            | none                     |
| `PS_BRIDGE_COS_REGION`            | COS only | Tencent Cloud COS region.                            | none                     |
| `PS_BRIDGE_COS_KEY_PREFIX`        | No       | Object key prefix for COS uploads.                   | `ps-bridge/exports`      |
| `PS_BRIDGE_COS_URL_EXPIRES`       | No       | Signed URL lifetime in seconds.                      | `315360000`              |

## COS Enablement

COS upload support is enabled only when these four variables are all present and non-empty:

```text
PS_BRIDGE_COS_SECRET_ID
PS_BRIDGE_COS_SECRET_KEY
PS_BRIDGE_COS_BUCKET
PS_BRIDGE_COS_REGION
```

When COS is not enabled, image results use inline data URLs.

## Invalid Port

`PS_BRIDGE_PORT` must be an integer from 1 to 65535. Invalid values are ignored and logged as warnings.

`PS_BRIDGE_SESSION_RESUME_TTL_MS` must be a non-negative integer. Invalid values are ignored and logged as warnings.

## CLI Environment

`PS_GENERATOR_REMOTE_PASSWORD` supplies the Photoshop Remote Connections
password for `setup-photoshop`, `setup-generator-settings`, `run`, and `dev`.
An explicit `--password` takes precedence; when neither is provided, the CLI
uses `password`. This variable is read by the CLI process and is separate from
the generator package-local `.env` loading described above.
