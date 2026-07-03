# Generator 配置

generator 通过 `PluginConfig` 接收结构化运行选项，通过环境变量接收部署覆盖项。

## PluginConfig

```ts
export interface PluginConfig {
  port?: number;
  pluginsDir?: string;
  [key: string]: unknown;
}
```

`port` 控制 HTTP/WebSocket 服务端口。`pluginsDir` 指向一个目录，其直接子目录是插件包。

## 默认值

| 设置             | 默认值                   |
| ---------------- | ------------------------ |
| Host             | `127.0.0.1`              |
| Port             | `7700`                   |
| Root WebSocket   | `/ws`                    |
| Plugin WebSocket | `/ws/{pluginId}`         |
| Plugin directory | package-local `plugins/` |

## 环境变量覆盖

环境变量是部署开关：

| 变量                        | 作用                                          |
| --------------------------- | --------------------------------------------- |
| `PS_BRIDGE_PORT`            | 有效时覆盖配置端口。                          |
| `PS_BRIDGE_PLUGINS_DIR`     | 未提供 `pluginsDir` 时，覆盖默认插件目录。    |
| `PS_BRIDGE_COS_SECRET_ID`   | COS 上传支持所需。                            |
| `PS_BRIDGE_COS_SECRET_KEY`  | COS 上传支持所需。                            |
| `PS_BRIDGE_COS_BUCKET`      | COS 上传支持所需。                            |
| `PS_BRIDGE_COS_REGION`      | COS 上传支持所需。                            |
| `PS_BRIDGE_COS_KEY_PREFIX`  | 可选对象 key 前缀，默认 `ps-bridge/exports`。 |
| `PS_BRIDGE_COS_URL_EXPIRES` | 可选签名 URL 有效期秒数，默认 `315360000`。   |

只有四个必需 COS 字段都存在且非空时，COS 上传支持才会启用。
