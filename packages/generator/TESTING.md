# `@ps-generator-bridge/generator` 测试规范

## 好测试的标准

只断言**外部可观察行为**，不断言实现细节。对本包而言：断言「server 经由注入的
`PsGenerator` 对 Photoshop 做了哪些调用」（注册菜单、订阅事件、命中后弹窗），以及「一条协议
消息经 WebSocket 往返能拿到正确响应」，而非私有字段、内部方法或调用顺序的偶然细节。

## 两个测试 seam

1. **注入式 `PsGenerator`**（最高 seam）——server 对 Photoshop 的**全部**交互都经过这一个
   注入对象。测试用录制式假件 `test/fakeGenerator.ts`（`FakeGenerator`）注入
   `PsBridgePlugin.init`，记录 `addMenuItem` / `onPhotoshopEvent` / `alert`，并能通过 `emit`
   回放菜单事件。

2. **自拥 WebSocket 服务器**（协议 seam）——`startServer` 起一个真实的 `ws` 服务器（端口 0 取
   临时端口），测试用真实 `ws` 客户端连上去，断言 `getServerInfo` 的请求/响应往返。`dispatch`
   单独做单元测试（未知方法、畸形帧、PS 不可用时 `psVersion` 缺省）。

**约定**：协议一旦新增方法（`sdk` 的 `ProtocolMethods`），就往 `handlers` 加实现、往
`FakeGenerator` 补它需要的 generator 方法——保持 mock 与契约同步。

## 范围内（CI 可跑，无需 Photoshop）

- `PsBridgePlugin` 初始化连线：注册菜单、订阅 `generatorMenuChanged`、不抛错（`port: 0`）。
- 菜单事件**按菜单 id 过滤**：命中自己的菜单才弹窗；他人菜单不误触。
- `dispatch`：`getServerInfo` 经注入 generator 取 `psVersion`；PS 不可用时缺省；未知方法返回
  `UNKNOWN_METHOD`；畸形帧返回 `undefined`。
- `startServer`：真实 socket 往返 `getServerInfo`；非 JSON 帧被丢弃且不崩连接。
- `logger`：`Error` / 对象参数被格式化为可读字符串。

**覆盖率门槛**：行/函数/语句 80%，分支 70%（`vitest.config.ts`）。`src/index.ts` 与
`src/devServer.ts` 是组合根 / 手动入口，排除在覆盖统计外（由手动 F5 验证）。

运行：`pnpm --filter @ps-generator-bridge/generator test`

## 路由 / 事件 / 模块的测试 seam

RFC 0001 引入的几条新 seam，都在进程内可测、无需 Photoshop：

- **`Registry`（装配接缝，ADR 0006）**——`registry.test.ts` 直接对 `Registry.dispatch` 断言：
  内建 `getServerInfo`、动态 `registerMethod`、handler 异常→`INTERNAL`、未知方法→`UNKNOWN_METHOD`、
  畸形帧→`undefined`。构造时传一个不 listen 的 fastify 实例即可。
- **`@api` / `@ws` 装饰器 + `bootstrap`（ADR 0006）**——`decorators.test.ts` 用一个被装饰的样例类，
  断言 `@ws` 方法经 `dispatch` 命中且绑定到实例（`this`）、`@api` 路由经真 HTTP 命中、且**类之间不串元数据**。
- **`ClientStore` + Event 推送（ADR 0007）**——`server.test.ts` 用真 `ws` 客户端断言 `/ws` 握手回
  `connected{clientId}`、root/plugin handler 收到相同的顶层 `context.clientId`、`?clientId=` 接管
  （旧 socket 被关且不产生伪 `onDisconnect`）、旧 `?id=` 兼容、endpoint 隔离、`broadcast` 到全员、
  `emit` 只到指定 client。
- **端到端（跨包）**——`e2e.test.ts` 用 sdk 的 `Connection`（注入 `ws`）连真 server：握手取 `clientId`、
  `invoke` 内建与 `@ws` 模块方法、订阅并收到 `broadcast` / 定向 `emit`。这是贯穿 protocol → Connection →
  server → Registry → module → Event 的最小垂直切片。

运行：`pnpm --filter @ps-generator-bridge/generator test`

## 范围外（仅手动 debug-launch 验证）

下列依赖真实环境，**不**写自动化测试，只通过 VSCode 启动项按 F5 手动验证：

- `generator-core` 经 `require` 加载本插件（CJS 入口 + `generator-core-version` 校验）。
- 与本地 Photoshop 的 TCP 连接（PS 已「启用远程连接」、密码 `password`）。
- 「文件 > 生成」下菜单项的真实渲染、点击弹窗。
- sourcemap + `outFiles` 让 TS 源码断点命中。
- 真实跨进程链路：`sdk` 客户端（浏览器 / Node）连上 PS 内 server 的 WebSocket 调
  `getServerInfo` 拿到真实 `psVersion`。`dev-server`（Fake PS）则覆盖「无 PS 也能跨进程联调」。
