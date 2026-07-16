# `@ps-generator-bridge/generator`

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/getting-started/run-generator
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/run-generator

PS Generator Bridge 的 Photoshop Generator 插件和 HTTP/WebSocket 服务。该包由 Adobe `generator-core` 在 Photoshop 内置 Node 运行时中加载，并把 Photoshop 操作暴露给 SDK 客户端。

完整公开文档位于仓库 docs：

- [运行 Generator](../../docs/zh/getting-started/run-generator.md)
- [配置](../../docs/zh/generator/configuration.md)
- [Photoshop 设置](../../docs/zh/generator/photoshop-setup.md)
- [故障排除](../../docs/zh/generator/troubleshooting.md)
- [API 路由](../../docs/zh/plugins/api-routes.md)

## 安装

```bash
npm install @ps-generator-bridge/generator
```

在本 monorepo 中开发：

```bash
pnpm --filter @ps-generator-bridge/generator build
pnpm --filter @ps-generator-bridge/generator test
```

已发布 runtime 是独立的 Windows x64 包。JavaScript runtime 依赖会被 bundle，
sharp 及其原生 vendor payload 保留在包内私有目录。

## 运行时职责

`generator-core` 通过 `main.js` 加载该包，随后调用：

```ts
init(generator, config);
```

初始化流程：

1. 基于注入的 Photoshop Generator API 创建 `PsBridgeHost`。
2. 注册 "PS Generator Bridge: Server" 菜单项。
3. 启动 HTTP/WebSocket 服务，默认端口为 `7700`。
4. 先加载显式插件包，再加载已配置的插件集合。
5. 在 Fastify 开始监听前注册内置模块和插件作用域 handler。

## 配置

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

环境变量覆盖项：

| 变量                              | 作用                                         |
| --------------------------------- | -------------------------------------------- |
| `PS_BRIDGE_PORT`                  | 覆盖 `PluginConfig.port`。                   |
| `PS_BRIDGE_PLUGINS`               | 最先加载、以平台分隔符连接的插件包绝对路径。 |
| `PS_BRIDGE_PLUGINS_DIR`           | 当未提供 `pluginsDir` 时覆盖默认插件目录。   |
| `PS_BRIDGE_LOG_DIR`               | 覆盖包内默认运行日志目录。                   |
| `PS_BRIDGE_SESSION_RESUME_TTL_MS` | 覆盖会话恢复 TTL（毫秒）。                   |
| `PS_BRIDGE_COS_*`                 | 所需凭据齐全时启用基于 COS 的图片上传。      |
| `PS_BRIDGE_COS_KEY_PREFIX`        | 覆盖 COS 对象 key 前缀。                     |
| `PS_BRIDGE_COS_URL_EXPIRES`       | 覆盖 COS 签名 URL 的有效期秒数。             |

`main.js` 会在加载 bundle 入口前读取包内 `.env`，因此 host 构造时可以使用这些覆盖项。

结构化运行参数优先使用 `PluginConfig`。环境变量用于部署期覆盖和密钥。

插件来源按以下顺序加载：`PS_BRIDGE_PLUGINS`、`PluginConfig.plugins`，然后是
`pluginsDir`（或 `PS_BRIDGE_PLUGINS_DIR`）中按名称排序的直接子目录。显式路径必须
是绝对路径，real path 重复项会被忽略。

## 服务端端点

| Endpoint                   | 作用                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `GET /health`              | 存活探针。                                                        |
| `GET /plugins`             | 列出已加载的外部插件 id。                                         |
| `GET /plugins/:id/health`  | 报告已加载 runtime 健康状态或已隔离的加载/注册错误。              |
| `GET/POST /{module}/...`   | 内置 action、document、layer、image、selection HTTP API。         |
| `GET/POST /{pluginId}/...` | 外部插件通过 `@api` 注册的 HTTP API。                             |
| `WS /ws`                   | 根 SDK 协议端点。                                                 |
| `WS /ws/:pluginId`         | 插件作用域协议端点，先查 scoped handler，再 fallback 到全局能力。 |

WebSocket 连接建立后，服务端发送的第一帧是包含服务端签发 `clientId` 的 `connected` 事件。客户端通过 `?resume={clientId}` 恢复会话。缺少、未知、过期或格式错误的 resume id 都不会报错，而是创建新会话。意外断线默认可恢复 30 分钟；SDK 显式调用 `close()` 会立即销毁会话。

## 内置能力

generator 注册的内置协议方法包括：

- 服务信息和插件发现
- JSX 执行（`jsx:run`、`jsx:execute`）
- Photoshop 事件订阅和取消订阅
- action 操作
- layer 信息读取
- document 操作
- 以 JSON-safe `WsImageResult` 返回的 image export
- selection 区域、路径和变更事件

协议方法名和 payload 类型定义在 `@ps-generator-bridge/sdk` 中；generator 实现必须与 `packages/sdk/src/protocol/` 保持一致。

## 插件宿主

每个外部插件包需要 `package.json`、`main` 入口和默认导出的同步 initializer。
initializer 接收冻结的 `PluginInitContext`，并返回普通 `PluginRuntime` 对象或
`BasePlugin` 实例。返回 Promise 的 initializer 会被拒绝。

插件 id 依次从 `package.json.pluginId`、`definePlugin(id, init)`、
`package.json.name` 解析，并且必须匹配 `[A-Za-z0-9_-]+`。第一个完整激活的候选
会占用 id；失败候选会把该 id 留给下一个来源继续尝试。

传给每个插件的 host 只暴露窄接口：

- `modules`：内置 layer、document、action、image、selection API
- `events`：Photoshop、主事件和插件本地事件的订阅；插件通过 `events.emit(...)` 发布本地事件
- `jsx`：作用域限定到插件自己的 `jsx` 目录，同时可访问内置 JSX
- `cos`：配置完整时提供的可选上传能力

不要把 Fastify、generator-core、COS SDK 具体类或其他服务端内部细节暴露给插件作者。边界应通过 `src/contract.ts` 中的 type-only 契约跨越。

初始化、注册和生命周期错误会被限制在所属插件内，并通过
`/plugins/{id}/health` 暴露。`onConnect` 和 `onDisconnect` 必须同步，
`onDispose` 可以异步。

## JSX 资源

纯 ExtendScript 资源位于 `jsx/`，以包文件形式发布，不由 tsup 打包。`JsxRunner` 在运行时从包目录解析这些文件，并且是调用 `evaluateJSXFile` 的唯一入口。

## 测试

```bash
pnpm --filter @ps-generator-bridge/generator typecheck
pnpm --filter @ps-generator-bridge/generator test
```

单元测试使用注入 seam，不需要 Photoshop：

- `FakeGenerator` 记录 generator-core 交互。
- 本地真实 WebSocket 服务使用临时端口。
- dispatch、registry、decorator、插件加载、事件和模块行为都在进程内测试。

测试范围和覆盖率规则见 [TESTING.md](./TESTING.md)。
