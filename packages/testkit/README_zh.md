# `@ps-generator-bridge/testkit`

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

PS Generator Bridge 插件的 Windows-only CLI 冒烟测试工具。它会用已发布的 generator 包启动 Adobe `generator-core`，验证 bridge 服务、插件发现，并通过 SDK 执行一次 `getServerInfo` 冒烟调用。

## 安装

```bash
npm install -D @ps-generator-bridge/testkit
```

在本 monorepo 中开发：

```bash
pnpm --filter @ps-generator-bridge/testkit build
pnpm --filter @ps-generator-bridge/testkit typecheck
```

## 环境要求

- Windows
- Node.js >=18
- Photoshop 已经运行
- Photoshop Generator 已启用
- Photoshop Remote Connections 已启用
- 可用的 Git 和 npm，用于安装 Adobe `generator-core`

## 命令

```bash
ps-bridge-test setup [--update]
ps-bridge-test run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
ps-bridge-test dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core]
```

### `setup`

把 Adobe `generator-core` 克隆或更新到：

```text
%LOCALAPPDATA%\ps-bridge-test\generator-core\master
```

并在该目录中执行 `npm install`。

### `run`

启动 `generator-core`，等待 `GET /health`，校验 `GET /plugins`，执行 SDK `getServerInfo` 冒烟调用，打印结果后退出。

```bash
ps-bridge-test run --plugin ./my-plugin --expect-plugin myPlugin
```

### `dev`

启动相同的 harness，但保持 `generator-core` 运行直到手动中断。

```bash
ps-bridge-test dev --plugins-dir ./plugins --port 7700
```

## 插件输入

必须且只能使用其中一种：

- `--plugin <dir>`：单个插件包目录
- `--plugins-dir <dir>`：直接子目录均为插件包的目录

`--expect-plugin <id>` 可以重复传入。如果 `/plugins` 中缺少任何期望 id，harness 会失败。

## Harness 验证内容

1. Photoshop 正在运行。
2. `generator-core` 已安装并能启动。
3. generator 包能被 `generator-core` 加载。
4. bridge 服务进入 healthy 状态。
5. 已加载插件数量与候选插件目录数量一致。
6. 期望插件 id 均存在。
7. SDK 能通过 WebSocket 连接并调用 `getServerInfo`。

## 限制

这是冒烟测试工具，不是完整集成测试框架。它不会驱动 Photoshop 文档，也不会断言插件自己的 UI 或业务流程。确定性逻辑应使用 package 单元测试；该 CLI 用于验证真实 Photoshop 启动链路。
