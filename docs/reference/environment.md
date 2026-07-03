# Environment Reference

Environment variables are deployment-time overrides. Structured runtime parameters should usually be passed through `PluginConfig`.

| Variable                    | Required | Purpose                                              | Default                  |
| --------------------------- | -------- | ---------------------------------------------------- | ------------------------ |
| `PS_BRIDGE_PORT`            | No       | Overrides the generator service port when valid.     | `7700`                   |
| `PS_BRIDGE_PLUGINS_DIR`     | No       | Directory whose direct children are plugin packages. | package-local `plugins/` |
| `PS_BRIDGE_COS_SECRET_ID`   | COS only | Tencent Cloud COS secret id.                         | none                     |
| `PS_BRIDGE_COS_SECRET_KEY`  | COS only | Tencent Cloud COS secret key.                        | none                     |
| `PS_BRIDGE_COS_BUCKET`      | COS only | Tencent Cloud COS bucket.                            | none                     |
| `PS_BRIDGE_COS_REGION`      | COS only | Tencent Cloud COS region.                            | none                     |
| `PS_BRIDGE_COS_KEY_PREFIX`  | No       | Object key prefix for COS uploads.                   | `ps-bridge/exports`      |
| `PS_BRIDGE_COS_URL_EXPIRES` | No       | Signed URL lifetime in seconds.                      | `315360000`              |

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
