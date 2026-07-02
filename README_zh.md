# PS Generator Bridge Service

PS Generator Bridge Service 是一个把 Photoshop Generator 能力通过类型化 WebSocket 协议暴露出来的 monorepo。

- `@ps-generator-bridge/sdk` 是同构客户端 SDK，也是协议契约的唯一事实来源。
- `@ps-generator-bridge/generator` 是由 Adobe `generator-core` 加载的 Photoshop Generator 插件。
- `@ps-generator-bridge/testkit` 是用于真实 Photoshop 和 `generator-core` 的 Windows 冒烟测试工具。

`generator` 包只以 type-only 方式依赖 SDK 契约。新增服务端能力时，先修改 `packages/sdk/src/protocol.ts`，再在 `packages/generator` 中实现。

## 包结构

| Package              | 职责                                                     | 运行环境                      |
| -------------------- | -------------------------------------------------------- | ----------------------------- |
| `packages/sdk`       | WebSocket 客户端、协议类型、插件开发原语                 | 浏览器和 Node >=18            |
| `packages/generator` | Photoshop Generator 插件、WebSocket 服务、模块和插件宿主 | Photoshop 内置 Node / Node 18 |
| `packages/testkit`   | Photoshop + `generator-core` CLI 冒烟测试工具            | Windows Node >=18             |

## 环境要求

- Node.js >=18
- pnpm 11.5.0
- 真实 Photoshop 调试需要启用 Generator 和 Remote Connections
- `@ps-generator-bridge/testkit` 仅支持 Windows

## 安装

```bash
pnpm install
pnpm setup
```

`pnpm setup` 会把 Adobe `generator-core` 克隆到 `./generator-core`。该目录已被 git 忽略，只在真实 Photoshop 中运行 generator 时需要。

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format
pnpm pack:check
```

也可以按包执行：

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/testkit typecheck
```

## 开发流程

1. 在 `packages/sdk/src/protocol.ts` 中建模协议能力。
2. 如果能力需要公开给调用方，在 SDK 中补充客户端封装。
3. 在 `packages/generator` 的 built-in 或 module 中实现服务端 handler。
4. 先用注入 seam 编写单元测试，例如 `FakeTransport` 和 `FakeGenerator`。
5. 需要真实环境验证时，再使用 testkit 或 VSCode 启动配置做 Photoshop 冒烟测试。

## 运行时概览

`generator` 包通过 CommonJS `main.js` 入口被 `generator-core` 加载。初始化时会：

1. 注册 Photoshop Generator 菜单项。
2. 在 `127.0.0.1` 启动 Fastify WebSocket 服务，默认端口为 `7700`。
3. 从 `pluginsDir` 或 `PS_BRIDGE_PLUGINS_DIR` 加载可选外部插件。
4. 注册 document、layer、action、image、JSX、event 等内置能力。

SDK 默认使用 `ws://127.0.0.1:7700` 作为服务 base URL，并连接到 `/ws`。

## 环境变量

| 变量                    | 作用                                    |
| ----------------------- | --------------------------------------- |
| `PS_BRIDGE_PORT`        | 覆盖 generator 的 WebSocket/HTTP 端口。 |
| `PS_BRIDGE_PLUGINS_DIR` | 指定外部插件包目录。                    |
| `PS_BRIDGE_COS_*`       | 所需字段齐全时启用腾讯云 COS 上传能力。 |

结构化运行参数（例如 `port`、`pluginsDir`）应通过 `PluginConfig` 传入；环境变量只作为部署覆盖项。

## 文档

- [CONTEXT.md](./CONTEXT.md) 定义项目术语。
- [packages/sdk/README.md](./packages/sdk/README.md) 说明客户端和协议包。
- [packages/generator/README.md](./packages/generator/README.md) 说明 Photoshop Generator 宿主。
- [packages/testkit/README.md](./packages/testkit/README.md) 说明冒烟测试工具。
- [docs/adr](./docs/adr) 记录架构决策。

英文文档见 [README.md](./README.md)。
