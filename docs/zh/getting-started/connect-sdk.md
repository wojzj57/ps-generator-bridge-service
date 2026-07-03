# 连接 SDK

使用 `@ps-generator-bridge/sdk` 中的 `Connection` 作为公开客户端门面。

## Root 连接

```ts
import { Connection } from "@ps-generator-bridge/sdk";

const connection = new Connection();

await connection.ready();

const info = await connection.getServerInfo();
const document = await connection.modules.document.getCurrentDocument();

connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});

connection.close();
```

`new Connection()` 使用默认服务 base URL `ws://127.0.0.1:7700`，并连接到 `/ws`。

## 自定义服务 URL

`options.url` 是服务 base URL，不是最终 WebSocket 路径。SDK 会追加路径。

```ts
const connection = new Connection({
  url: "http://127.0.0.1:7700",
});
```

实例连接会把 HTTP base URL 转成 WebSocket URL：

- `http:` -> `ws:`
- `https:` -> `wss:`

## 插件端点连接

调用插件私有方法或监听插件本地事件时，使用插件 id：

```ts
const paint = new Connection("paint");

await paint.ready();

paint.on("paint:changed", (event) => {
  console.log(event);
});

await paint.invoke("paint:createSession", { documentId: 1 });
```

## 服务级辅助方法

服务状态和插件发现走 HTTP：

```ts
const status = await Connection.status();
const plugins = await Connection.plugins();
```

`Connection.status()` 返回 `{ ok: true, status: "ok" }` 或 `{ ok: false, error }`。`Connection.plugins()` 返回 `PluginInfo[]`，遇到 HTTP、fetch 或响应形状错误时抛出普通 `Error`。

仅在本地 bridge 服务不健康时打开 LightBox Photoshop 入口页：

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

`openPhotoshopOnLightBox()` 会先调用 `Connection.status()`。如果 bridge 已经健康，它不会做任何事；否则会在新的浏览器页面中打开 LightBox Photoshop 入口页。
