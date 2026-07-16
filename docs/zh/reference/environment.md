# 环境变量参考

环境变量是部署期覆盖项。结构化运行参数通常应通过 `PluginConfig` 传入。

generator 入口 `packages/generator/main.js` 会在加载打包后的 host 代码之前读取包内 `.env`。本地 Photoshop Generator 启动可以使用该文件；进程里已经存在的环境变量不会被覆盖。

| 变量                              | 必需   | 作用                            | 默认值                   |
| --------------------------------- | ------ | ------------------------------- | ------------------------ |
| `PS_BRIDGE_PORT`                  | 否     | 有效时覆盖 generator 服务端口。 | `7700`                   |
| `PS_BRIDGE_PLUGINS`               | 否     | 按顺序加载的插件包绝对路径。    | 无                       |
| `PS_BRIDGE_PLUGINS_DIR`           | 否     | 直接子目录为插件包的目录。      | package-local `plugins/` |
| `PS_BRIDGE_LOG_DIR`               | 否     | generator 运行日志目录。        | package-local `logs/`    |
| `PS_BRIDGE_SESSION_RESUME_TTL_MS` | 否     | 意外断线会话恢复 TTL（毫秒）。  | `1800000`                |
| `PS_BRIDGE_COS_SECRET_ID`         | 仅 COS | 腾讯云 COS secret id。          | 无                       |
| `PS_BRIDGE_COS_SECRET_KEY`        | 仅 COS | 腾讯云 COS secret key。         | 无                       |
| `PS_BRIDGE_COS_BUCKET`            | 仅 COS | 腾讯云 COS bucket。             | 无                       |
| `PS_BRIDGE_COS_REGION`            | 仅 COS | 腾讯云 COS region。             | 无                       |
| `PS_BRIDGE_COS_KEY_PREFIX`        | 否     | COS 上传对象 key 前缀。         | `ps-bridge/exports`      |
| `PS_BRIDGE_COS_URL_EXPIRES`       | 否     | 签名 URL 有效期秒数。           | `315360000`              |

`PS_BRIDGE_PLUGINS` 是平台分隔的路径列表（Windows 使用 `;`，POSIX 使用 `:`）。
这些显式包会先于 `PluginConfig.plugins` 和 `pluginsDir` / `PS_BRIDGE_PLUGINS_DIR`
选中的集合加载。路径必须是绝对路径；空条目和 real path 重复项会被忽略。

## COS 启用条件

只有下面四个变量都存在且非空时，COS 上传支持才会启用：

```text
PS_BRIDGE_COS_SECRET_ID
PS_BRIDGE_COS_SECRET_KEY
PS_BRIDGE_COS_BUCKET
PS_BRIDGE_COS_REGION
```

未启用 COS 时，图片结果使用内联 data URL。

## 无效端口

`PS_BRIDGE_PORT` 必须是 1 到 65535 之间的整数。无效值会被忽略并记录 warning。

`PS_BRIDGE_SESSION_RESUME_TTL_MS` 必须是非负整数。无效值会被忽略并记录 warning。

## CLI 环境变量

`PS_GENERATOR_REMOTE_PASSWORD` 为 `setup-photoshop`、
`setup-generator-settings`、`run` 和 `dev` 提供 Photoshop 远程连接密码。
显式传入的 `--password` 优先；两者都未提供时，CLI 使用 `password`。
该变量由 CLI 进程读取，与上文 generator 从包内 `.env` 加载变量的行为相互独立。
