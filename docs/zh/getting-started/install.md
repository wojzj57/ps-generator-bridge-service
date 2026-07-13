# 安装

PS Generator Bridge 是一个 monorepo，包含三个发布包：

- `@ps-generator-bridge/sdk`：同构客户端 SDK 和协议契约。
- `@ps-generator-bridge/generator`：Photoshop Generator 插件和 WebSocket 服务。
- `@ps-generator-bridge/cli`：命令行工具，包括用于 Photoshop 和 `generator-core` 的 Windows 冒烟测试工具。

## 环境要求

- Node.js 18 或更新版本。
- 仓库开发使用 pnpm 11.5.0。
- 真实 Photoshop 运行需要支持 Generator 的 Photoshop。
- `@ps-generator-bridge/cli` 的 run/dev 冒烟命令仅支持 Windows。

## 仓库安装

```bash
pnpm install
pnpm setup
```

`pnpm setup` 会把 Adobe `generator-core` 克隆到 `./generator-core`。该目录被 git 忽略，只在通过 Photoshop 运行 generator 时需要。

## Generator Runtime 安装

普通用户不需要 clone 本仓库。可以直接运行已发布的 CLI：

```bash
pnpm dlx @ps-generator-bridge/cli setup
```

默认会把最小 runtime 安装到 `./generator-bridge`。可以用 `--dir` 指定其他位置：

```bash
pnpm dlx @ps-generator-bridge/cli setup --dir D:\Tools\generator-bridge
```

再次执行 `setup` 时，只会更新安装器管理的文件，并保留包内 `.env`、`logs/`、`plugins/` 及其他用户文件。对于非空且不属于已管理 runtime 的目录，命令会拒绝覆盖。

在 Windows 上，CLI 也可以把 runtime 安装到用户选择的 Photoshop：

```bash
pnpm dlx @ps-generator-bridge/cli setup-photoshop
pnpm dlx @ps-generator-bridge/cli setup-photoshop --version 2025 --yes
```

`setup-photoshop` 要求 Photoshop 已完全关闭，并安装到 `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`。它以原子替换方式只修改现有 `MachinePrefs.psp` 中启用 Generator 和远程连接所需的字段，不创建备份。远程连接密码依次来自 `--password`、`PS_GENERATOR_REMOTE_PASSWORD` 或默认值 `password`。更新已管理 runtime 时会保留 `.env`、`logs/`、`plugins/` 及其他用户文件。如果目标目录包含不受管理的文件，命令会先询问是否替换；`--yes` 表示无需询问即可授权替换。

## SDK 使用方安装

```bash
npm install @ps-generator-bridge/sdk
```

如果 Node 运行时没有全局 `WebSocket`（例如 Node 18），需要安装并注入 `ws`：

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
pnpm --filter @ps-generator-bridge/cli typecheck
```
