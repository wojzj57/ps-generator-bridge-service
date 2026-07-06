# 故障排查

## 无法连接

先检查健康检查端点：

```bash
curl http://127.0.0.1:7700/health
```

如果没有返回 `{ "status": "ok" }`，确认 generator 包已经加载，并检查 `PS_BRIDGE_PORT` 或 `PluginConfig.port` 是否让客户端连到了错误端口。

## Node 缺少 WebSocket

Node 18-21 没有全局 `WebSocket`。需要注入：

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## 找不到插件

插件 endpoint 连接使用 `/ws/{pluginId}`。如果插件 id 未知，服务端会发送 `PLUGIN_NOT_FOUND` 错误帧并关闭 socket。

检查插件发现：

```ts
const plugins = await Connection.plugins();
console.log(plugins);
```

检查某个插件的加载诊断：

```ts
const health = await Connection.pluginHealth("paint");
console.log(health.status, health.lastError);
```

## 插件事件没有送达

检查这些条件：

- 客户端使用 `new Connection(pluginId)` 连接。
- 客户端在期待事件前注册了 `on(type, listener)`。
- 插件通过 `this.events.emit(type, payload)` 发布。
- root endpoint 客户端没有订阅插件本地事件名。

## JSX 不可用

`jsx:run` 和 `jsx:execute` 需要服务端创建时提供 JSX runner。真实 generator 启动会通过 `PsBridgeHost` 提供它。某些低层 server 测试或自定义嵌入可能会省略 JSX。

## 没有使用 COS 上传

COS 只有在所有必需字段存在时才启用：

- `PS_BRIDGE_COS_SECRET_ID`
- `PS_BRIDGE_COS_SECRET_KEY`
- `PS_BRIDGE_COS_BUCKET`
- `PS_BRIDGE_COS_REGION`

如果任何字段缺失或为空，image export 会回退到内联 data URL。
