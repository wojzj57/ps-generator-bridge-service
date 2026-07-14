# PS Generator Bridge Service

<p align="center">
  <a href="https://wojzj57.github.io/ps-generator-bridge-service/"><img alt="Docs" src="https://img.shields.io/badge/docs-EN-blue" /></a>
  <a href="https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install"><img alt="Docs ZH" src="https://img.shields.io/badge/docs-ZH-blue" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green.svg" /></a>
  <a href="https://pnpm.io/"><img alt="pnpm" src="https://img.shields.io/badge/pnpm-11.5.0-orange.svg" /></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/generator"><img alt="npm generator" src="https://img.shields.io/npm/v/@ps-generator-bridge/generator?label=generator" /></a>
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/sdk"><img alt="npm sdk" src="https://img.shields.io/npm/v/@ps-generator-bridge/sdk?label=sdk" /></a>
  <a href="https://www.npmjs.com/package/@ps-generator-bridge/cli"><img alt="npm cli" src="https://img.shields.io/npm/v/@ps-generator-bridge/cli?label=cli" /></a>
</p>

文档入口：[English](https://wojzj57.github.io/ps-generator-bridge-service/) · [简体中文](https://wojzj57.github.io/ps-generator-bridge-service/zh/getting-started/install)

PS Generator Bridge Service 是一个把 Photoshop Generator 能力通过类型化 WebSocket 协议暴露出来的 monorepo。

- `@ps-generator-bridge/sdk` 是同构客户端 SDK，也是协议契约的唯一事实来源。
- `@ps-generator-bridge/generator` 是由 Adobe `generator-core` 加载的 Photoshop Generator 插件。
- `@ps-generator-bridge/cli` 提供命令行工具，包括用于真实 Photoshop 和 `generator-core` 的 Windows 冒烟测试工具。

发布后的 `generator` 包不在运行时依赖 SDK 包：构建时通过 alias 内联 SDK 的协议和
插件开发源码，generator 面向插件的契约则以 type-only 方式反向进入 SDK。
新增服务端能力时，先修改 `packages/sdk/src/protocol/` 中的 `ProtocolMethods`，
再在 `packages/generator` 中实现。

## 包结构

| Package              | 职责                                                     | 运行环境                       |
| -------------------- | -------------------------------------------------------- | ------------------------------ |
| `packages/sdk`       | WebSocket 客户端、协议类型、插件开发原语                 | 浏览器和 Node >=18             |
| `packages/generator` | Photoshop Generator 插件、WebSocket 服务、模块和插件宿主 | Photoshop 内置 Node / Node 18  |
| `packages/cli`       | CLI 工具和 Photoshop + `generator-core` 冒烟测试工具     | run/dev 需要 Windows Node >=18 |

## 环境要求

- Node.js >=18
- pnpm 11.5.0
- 真实 Photoshop 调试需要启用 Generator 和 Remote Connections
- `@ps-generator-bridge/cli` 的 run/dev 冒烟命令仅支持 Windows

## 安装

```bash
pnpm install
pnpm setup
```

`pnpm setup` 会在用户级 `ps-generator-bridge` 统一缓存中准备 Adobe `generator-core` 和 npm 上最新的 generator runtime。Windows 根目录为 `%LOCALAPPDATA%\ps-generator-bridge`，不再使用仓库内的 `./generator-core`。

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format
pnpm pack:check
pnpm docs:build
```

也可以按包执行：

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/cli typecheck
```

## 开发流程

1. 在 `packages/sdk/src/protocol/` 的 `ProtocolMethods` 中建模协议能力。
2. 如果能力需要公开给调用方，在 SDK 中补充客户端封装。
3. 在 `packages/generator` 的 built-in 或 module 中实现服务端 handler。
4. 先用注入 seam 编写单元测试，例如 `FakeTransport` 和 `FakeGenerator`。
5. 需要真实环境验证时，再使用 CLI 冒烟工具或 VSCode 启动配置做 Photoshop 冒烟测试。

## 运行时概览

`generator` 包通过 CommonJS `main.js` 入口被 `generator-core` 加载。初始化时会：

1. 注册 Photoshop Generator 菜单项。
2. 在 `127.0.0.1` 启动 Fastify HTTP/WebSocket 服务，默认端口为 `7700`。
3. 从 `pluginsDir` 或 `PS_BRIDGE_PLUGINS_DIR` 加载可选外部插件。
4. 注册 document、layer、action、image、selection、JSX、event 等内置能力。

SDK 默认使用 `ws://127.0.0.1:7700` 作为服务 base URL，并连接到 `/ws`。

## 内置能力

| 模块        | 能力摘要                                       |
| ----------- | ---------------------------------------------- |
| `action`    | 主体选择和背景移除。                           |
| `document`  | 当前文档元数据、导出和保存操作。               |
| `layer`     | 图层查询、预览、图片导入和图层变更事件。       |
| `image`     | 图层、选中路径、预览和文档图片导出。           |
| `selection` | 选择监听、区域、路径和 selection change 事件。 |

每项能力的 SDK、Plugin Host、WebSocket、HTTP API 和 MCP 可用性见
[内置能力矩阵](./docs/zh/reference/built-in-capabilities.md)。当前版本尚未实现 MCP。

## 环境变量

| 变量                           | 作用                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `PS_BRIDGE_PORT`               | 覆盖 generator 的 WebSocket/HTTP 端口。                  |
| `PS_BRIDGE_PLUGINS_DIR`        | 指定外部插件包目录。                                     |
| `PS_BRIDGE_LOG_DIR`            | 指定 generator 运行日志目录。                            |
| `PS_BRIDGE_COS_*`              | 所需字段齐全时启用腾讯云 COS 上传能力。                  |
| `PS_GENERATOR_REMOTE_PASSWORD` | CLI 的 Photoshop 设置、run、dev 命令使用的远程连接密码。 |

结构化运行参数（例如 `port`、`pluginsDir`）应通过 `PluginConfig` 传入；环境变量只作为部署覆盖项。

## 文档

- [docs/zh/README.md](./docs/zh/README.md) 是 GitHub 和 GitHub Pages 的中文公开文档入口。
- [docs/zh/getting-started/install.md](./docs/zh/getting-started/install.md) 说明安装和前置条件。
- [docs/zh/getting-started/run-generator.md](./docs/zh/getting-started/run-generator.md) 说明 Generator 运行方式。
- [docs/zh/getting-started/connect-sdk.md](./docs/zh/getting-started/connect-sdk.md) 说明 SDK 连接方式。
- [docs/zh/generator/configuration.md](./docs/zh/generator/configuration.md) 说明 Generator 配置。
- [docs/zh/generator/photoshop-setup.md](./docs/zh/generator/photoshop-setup.md) 说明 Photoshop 设置。
- [docs/zh/generator/troubleshooting.md](./docs/zh/generator/troubleshooting.md) 说明排障方式。
- [docs/zh/plugins/authoring.md](./docs/zh/plugins/authoring.md) 说明外部插件开发。
- [docs/zh/reference/protocol.md](./docs/zh/reference/protocol.md) 说明公开协议契约。
- [docs/zh/reference/built-in-capabilities.md](./docs/zh/reference/built-in-capabilities.md) 对比内置能力的访问面。
- [docs/zh/reference/environment.md](./docs/zh/reference/environment.md) 说明环境变量。
- [docs/zh/reference/package-exports.md](./docs/zh/reference/package-exports.md) 说明包导出边界。
- [CONTEXT.md](./CONTEXT.md) 定义项目术语。

English documentation is available in [README.md](./README.md).
