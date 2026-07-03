# 安装

PS Generator Bridge 是一个 monorepo，包含三个发布包：

- `@ps-generator-bridge/sdk`：同构客户端 SDK 和协议契约。
- `@ps-generator-bridge/generator`：Photoshop Generator 插件和 WebSocket 服务。
- `@ps-generator-bridge/testkit`：用于 Photoshop 和 `generator-core` 的 Windows 冒烟测试工具。

## 环境要求

- Node.js 18 或更新版本。
- 仓库开发使用 pnpm 11.5.0。
- 真实 Photoshop 运行需要支持 Generator 的 Photoshop。
- `@ps-generator-bridge/testkit` CLI 仅支持 Windows。

## 仓库安装

```bash
pnpm install
pnpm setup
```

`pnpm setup` 会把 Adobe `generator-core` 克隆到 `./generator-core`。该目录被 git 忽略，只在通过 Photoshop 运行 generator 时需要。

## SDK 使用方安装

```bash
npm install @ps-generator-bridge/sdk
```

Node 18-21 没有全局 `WebSocket`。这些运行时需要安装并注入 `ws`：

```bash
npm install ws
```

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## 开发命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format:check
```

按包执行检查：

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/testkit typecheck
```
