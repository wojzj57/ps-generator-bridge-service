# Generator 配置

generator 通过 `PluginConfig` 接收结构化运行选项，通过环境变量接收部署覆盖项。

## PluginConfig

```ts
export interface PluginConfig {
  port?: number;
  plugins?: string[];
  pluginsDir?: string;
  maxImportImageBytes?: number;
  maxImportImagePixels?: number;
  allowedImportImageFormats?: string[];
  allowLocalImagePaths?: boolean;
  sessionResumeTtlMs?: number;
  [key: string]: unknown;
}
```

`port` 控制 HTTP/WebSocket 服务端口。`plugins` 包含按数组顺序加载的插件包绝对路径。
`pluginsDir` 指向集合目录，其直接子目录是插件包。

插件来源按以下优先级加载：

1. `PS_BRIDGE_PLUGINS` 中按列表顺序排列的绝对路径
2. `PluginConfig.plugins` 中按数组顺序排列的绝对路径
3. `pluginsDir` 的直接子目录，按目录名排序

所有来源会按 real path 去重。第一个完整激活的候选会占用插件 id；初始化或注册失败时，
后续候选仍可尝试同一个 id。

layer 图片导入会在交给 Photoshop 前校验输入。`maxImportImageBytes` 限制解码后/导入的图片字节数，`maxImportImagePixels` 按总像素数限制图片尺寸，`allowedImportImageFormats` 限制可接受格式，`allowLocalImagePaths` 控制公开 `layer:importImage` 请求是否允许使用本地路径或 `file://` URI。

`sessionResumeTtlMs` 控制意外断线的 WebSocket 会话可恢复多久，默认 30 分钟。SDK 显式调用 `close()` 时会立即销毁会话。

## 默认值

| 设置               | 默认值                               |
| ------------------ | ------------------------------------ |
| Host               | `127.0.0.1`                          |
| Port               | `7700`                               |
| Root WebSocket     | `/ws`                                |
| Plugin WebSocket   | `/ws/{pluginId}`                     |
| Plugin directory   | package-local `plugins/`             |
| Import max bytes   | `104857600`                          |
| Import max pixels  | `100000000`                          |
| Import formats     | `png`, `jpeg`, `webp`, `gif`, `tiff` |
| Local image paths  | enabled                              |
| Session resume TTL | `1800000` ms                         |

## 环境变量覆盖

环境变量是部署开关：

generator-core 通过 `main.js` 加载包时，会先读取包内 `.env`，再启动打包后的 host 代码。进程中已经存在的环境变量优先，不会被 `.env` 覆盖。

| 变量                              | 作用                                           |
| --------------------------------- | ---------------------------------------------- |
| `PS_BRIDGE_PORT`                  | 有效时覆盖配置端口。                           |
| `PS_BRIDGE_PLUGINS`               | 前置加载以平台分隔符连接的插件包绝对路径列表。 |
| `PS_BRIDGE_PLUGINS_DIR`           | 未提供 `pluginsDir` 时，覆盖默认插件目录。     |
| `PS_BRIDGE_LOG_DIR`               | bundle 加载前覆盖 generator 运行日志目录。     |
| `PS_BRIDGE_SESSION_RESUME_TTL_MS` | 使用非负整数覆盖会话恢复 TTL。                 |
| `PS_BRIDGE_COS_SECRET_ID`         | COS 上传支持所需。                             |
| `PS_BRIDGE_COS_SECRET_KEY`        | COS 上传支持所需。                             |
| `PS_BRIDGE_COS_BUCKET`            | COS 上传支持所需。                             |
| `PS_BRIDGE_COS_REGION`            | COS 上传支持所需。                             |
| `PS_BRIDGE_COS_KEY_PREFIX`        | 可选对象 key 前缀，默认 `ps-bridge/exports`。  |
| `PS_BRIDGE_COS_URL_EXPIRES`       | 可选签名 URL 有效期秒数，默认 `315360000`。    |

只有四个必需 COS 字段都存在且非空时，COS 上传支持才会启用。

`PS_BRIDGE_PLUGINS` 使用平台路径分隔符：Windows 为 `;`，POSIX 系统为 `:`。
空条目会被忽略。
