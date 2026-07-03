# `@ps-generator-bridge/generator`

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/getting-started/run-generator
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/run-generator

PS Generator Bridge 的 Photoshop Generator 插件和 WebSocket 服务。该包由 Adobe `generator-core` 在 Photoshop 内置 Node 运行时中加载，并把 Photoshop 操作暴露给 SDK 客户端。

## 安装

```bash
npm install @ps-generator-bridge/generator
```

在本 monorepo 中开发：

```bash
pnpm --filter @ps-generator-bridge/generator build
pnpm --filter @ps-generator-bridge/generator test
```

## 运行时职责

`generator-core` 通过 `main.js` 加载该包，随后调用：

```ts
init(generator, config);
```

初始化流程：

1. 基于注入的 Photoshop Generator API 创建 `PsBridgeHost`。
2. 注册 "PS Generator Bridge: Server" 菜单项。
3. 启动 HTTP/WebSocket 服务，默认端口为 `7700`。
4. 从 `pluginsDir` 或 `PS_BRIDGE_PLUGINS_DIR` 加载外部插件包。
5. 在 Fastify 开始监听前注册内置模块和插件作用域 handler。

## 配置

```ts
export interface PluginConfig {
  port?: number;
  pluginsDir?: string;
  [key: string]: unknown;
}
```

环境变量覆盖项：

| 变量                    | 作用                                       |
| ----------------------- | ------------------------------------------ |
| `PS_BRIDGE_PORT`        | 覆盖 `PluginConfig.port`。                 |
| `PS_BRIDGE_PLUGINS_DIR` | 当未提供 `pluginsDir` 时覆盖默认插件目录。 |
| `PS_BRIDGE_COS_*`       | 所需凭据齐全时启用基于 COS 的图片上传。    |

结构化运行参数优先使用 `PluginConfig`。环境变量用于部署期覆盖和密钥。

## 服务端端点

| Endpoint           | 作用                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `GET /health`      | 存活探针。                                                        |
| `GET /plugins`     | 列出已加载的外部插件 id。                                         |
| `WS /ws`           | 根 SDK 协议端点。                                                 |
| `WS /ws/:pluginId` | 插件作用域协议端点，先查 scoped handler，再 fallback 到全局能力。 |

WebSocket 连接建立后，服务端发送的第一帧是包含 `clientId` 的 `connected` 事件。客户端重连时通过 `?id=` 回传该 id。

## 内置能力

generator 注册的内置协议方法包括：

- 服务信息和插件发现
- JSX 执行（`jsx:run`、`jsx:execute`）
- Photoshop 事件订阅和取消订阅
- action 操作
- layer 信息读取
- document 操作
- 以 JSON-safe `WsImageResult` 返回的 image export

协议方法名和 payload 类型定义在 `@ps-generator-bridge/sdk` 中；generator 实现必须与 `packages/sdk/src/protocol.ts` 保持一致。

## 插件宿主

外部插件从插件目录的直接子目录加载。每个插件包需要包含 `package.json`、`main` 入口，以及一个继承 `BasePlugin` 的默认导出类。

传给每个插件的 host 只暴露窄接口：

- `modules`：内置 layer、document、action、image API
- `events`：Photoshop 事件订阅
- `jsx`：作用域限定到插件自己的 `jsx` 目录，同时可访问内置 JSX
- `cos`：配置完整时提供的可选上传能力

不要把 Fastify、generator-core、COS SDK 具体类或其他服务端内部细节暴露给插件作者。边界应通过 `src/contract.ts` 中的 type-only 契约跨越。

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
