# `@ps-generator-bridge/sdk`

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/sdk/connection
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/sdk/connection

PS Generator Bridge 的同构 TypeScript SDK。该包可在浏览器和 Node >=18 中使用，并且是 generator 服务端共享协议契约的唯一事实来源。

## 安装

```bash
npm install @ps-generator-bridge/sdk
```

在本 monorepo 中开发：

```bash
pnpm --filter @ps-generator-bridge/sdk build
pnpm --filter @ps-generator-bridge/sdk test
```

## 快速开始

```ts
import { Connection } from "@ps-generator-bridge/sdk";

const connection = new Connection({
  url: "ws://127.0.0.1:7700",
});

await connection.ready();
const info = await connection.getServerInfo();
const document = await connection.modules.document.getCurrentDocument();

connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});

connection.close();
```

使用静态 HTTP helper 查询服务级信息：

```ts
const status = await Connection.status();
const plugins = await Connection.plugins();
const paintHealth = await Connection.pluginHealth("paint");
```

需要调用插件私有方法或监听插件事件时，按插件 id 创建 endpoint 连接：

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});

await paint.invoke("paint:createSession", { documentId: 1 });
```

如果 Node 运行时没有全局 `WebSocket`（例如 Node 18），需要注入实现：

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  url: "ws://127.0.0.1:7700",
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## 公共接口

- `Connection` 是当前推荐的客户端门面，负责重连、稳定 `clientId`、请求关联、事件、JSX 执行和内置模块。
- `new Connection()` 连接默认 root 服务 URL，`new Connection(options)` 接收 root 服务 URL，`new Connection(pluginId)` 连接插件 endpoint，`new Connection(pluginId, options)` 同时指定两者。
- `connection.endpoint` 表示当前连接指向 root endpoint 还是插件 endpoint。
- `connection.clientId` 在握手后暴露服务端分配的 client id；跨进程重启时，可自行保存并通过 `options.resume` 传回。
- `connection.reconnect()` 会替换 socket 并保留逻辑会话。`connection.close()` 是终止操作，会销毁服务端会话。
- `Connection.status()` 查询 `/health`；`Connection.plugins()` 查询 `/plugins`；`Connection.pluginHealth(id)` 查询 `/plugins/{id}/health`。
- `connection.on()`、`connection.once()`、`connection.off()` 通过协议订阅和取消订阅服务端事件。
- 插件私有 API 通过插件 endpoint 连接上的 `connection.invoke(...)` 调用。
- `connection.jsx` 执行协议暴露的远程 JSX 方法。插件作者通过 `PluginInitContext` 直接使用插件作用域 helper，或经由 `BasePlugin` 使用。
- `RawConnection` 提供更底层的强类型 `invoke()` 和事件订阅。
- `PsBridgeClient` 为兼容旧调用方保留，已废弃，推荐迁移到 `Connection`。
- `createWebSocketTransport` 和 `Transport` 是测试与自定义运行时使用的传输层 seam。
- `ConnectionInterruptedError` 表示请求已发出，但在收到响应前 transport 中断；SDK 不会自动重放此类请求。
- `@ps-generator-bridge/sdk/plugin` 导出同步 initializer 契约（`definePlugin`、`PluginInitContext`、`PluginInitializer`、`PluginRuntime`）、decorator 开发原语（`BasePlugin`、`ws`、`api`、`bootstrap`）以及 type-only 宿主契约。

旧门面的 breaking changes：

- `options.url` 现在是服务 base URL，例如 `ws://127.0.0.1:7700`；SDK 会追加 `/ws` 或 `/ws/{pluginId}`。
- `connection.id` 已移除。请使用 `connection.clientId`。
- 可由调用方指定的 `options.clientId` 已移除。请保存服务端签发的 id，并通过 `options.resume` 传回；`RawConnection.id` 已改为 `RawConnection.clientId`。
- `connection.plugin` 已移除。发现插件用 `Connection.plugins()`，调用插件 endpoint 用 `new Connection(pluginId)`。

## 协议契约

`src/protocol/` 定义：

- `ProtocolMethod` 中的方法名
- `ProtocolMethods` 中的请求和响应类型
- `ProtocolEvents` 中的服务端推送事件
- `parseFrame`、`serializeFrame`、`isRequest`、`isResponse`、`isEvent` 等 wire envelope 工具

新增服务端能力时：

1. 先在 `ProtocolMethod` 和 `ProtocolMethods` 中建模。
2. 增加序列化、类型和客户端行为测试。
3. 在 `@ps-generator-bridge/generator` 中实现服务端 handler。
4. 只有当它属于公开 SDK 能力时，才在 `Connection` 上增加便利方法。

## 内置模块

`Connection.modules` 当前提供：

- `document.getCurrentDocument()`
- `document.exportDocument(params)`
- `document.saveDocument(params)`
- `layer.getLayerInfo(params?)`
- `layer.getLayerInfoByID(layerID, options?)`
- `layer.getLayerInfoByIndex(layerIndex, options?)`
- `action.autoCutout()`
- `action.removeBackground()`
- `image.exportLayer(params)`
- `image.getPreview(params)`
- `image.exportDocument(params)`

## 插件开发

外部插件包应使用 plugin subpath：

```ts
import { BasePlugin, definePlugin, ws } from "@ps-generator-bridge/sdk/plugin";

class MyPlugin extends BasePlugin {
  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }
}

export default definePlugin("myPlugin", (context) => new MyPlugin(context));
```

默认导出必须是同步 initializer。它可以返回 `BasePlugin` 实例或普通
`PluginRuntime` 对象；普通插件通过 `context.ws()` 和 `context.api()` 注册 handler。

SDK plugin subpath 必须保持轻量和平台无关。不要把 Fastify、`ws`、Photoshop Generator 内部类型、COS SDK 类型或其他 Node-only 实现细节引入包根入口。

## 测试

```bash
pnpm --filter @ps-generator-bridge/sdk typecheck
pnpm --filter @ps-generator-bridge/sdk test
```

SDK 测试使用 `FakeTransport`，不需要 Photoshop。
