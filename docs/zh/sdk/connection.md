# Connection

`Connection` 是高层 SDK 门面。它管理 WebSocket 连接状态、重连、请求关联、事件订阅、JSX、Photoshop 代理助手和内置模块。

## 构造函数

```ts
new Connection();
new Connection(options);
new Connection(pluginId, options?);
```

`options.url` 是服务 base URL，不是最终 WebSocket 路径。

| 输入                                                    | WebSocket 端点                 |
| ------------------------------------------------------- | ------------------------------ |
| `new Connection()`                                      | `ws://127.0.0.1:7700/ws`       |
| `new Connection({ url: "ws://host:7700" })`             | `ws://host:7700/ws`            |
| `new Connection("paint")`                               | `ws://127.0.0.1:7700/ws/paint` |
| `new Connection("paint", { url: "https://host:7700" })` | `wss://host:7700/ws/paint`     |

## 端点元数据

每个连接都会暴露不可变的端点元数据：

```ts
connection.endpoint;
```

Root 连接：

```ts
{
  kind: "root";
}
```

插件端点连接：

```ts
{ kind: "plugin", pluginId: "paint" }
```

## 客户端身份

服务端握手后：

```ts
connection.clientId;
```

服务端在第一个 `connected` 事件中分配 `clientId`，客户端不能自行指定。重连时，SDK 会通过 `?resume=` 回传最近一次由服务端签发的 id，以恢复同一个逻辑会话。未知、过期或格式错误的 resume id 不会报错，而是创建新会话。

如果宿主需要跨进程或插件重启保留身份，请在 `ready()` 后自行保存 `connection.clientId`，下次连接时显式传回：

```ts
const connection = new Connection("paint", { resume: storedClientId });
await connection.ready();
saveClientId(connection.clientId);
```

SDK 不限定持久化方式。

`connection.id` 不是公开 `Connection` API。

## 就绪状态

```ts
await connection.ready();
```

`ready()` 在收到 `connected` 握手后 resolve。`invoke()` 会等待连接就绪，并在短暂重连期间排队。

使用 `reconnect()` 替换当前 socket，同时保留逻辑会话：

```ts
await connection.reconnect();
```

断线前已经发送的请求会以 `ConnectionInterruptedError` reject，且不会自动重放，因为服务端操作可能已经完成。重连期间新发起的调用会等待下一次握手。活跃事件订阅会在重连后重新注册。

## 关闭

```ts
connection.close();
```

`close()` 是终止操作：它会停止重连、拒绝未完成的工作，并通知服务端立即销毁会话。关闭后的 `Connection` 不能再次重连。

## 公开表面

```ts
connection.invoke(method, params);
connection.modules;
connection.jsx;
connection.photoshop;
connection.on(type, listener);
connection.once(type, listener);
connection.off(type, listener);
connection.getServerInfo();
connection.ready();
connection.reconnect();
connection.close();
```

插件发现是静态方法：

```ts
const plugins = await Connection.plugins();
const paintHealth = await Connection.pluginHealth("paint");
```

LightBox Photoshop 启动能力是独立 helper，不是 `Connection` 方法：

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

它会先检查 `Connection.status()`，只有当 status 结果为 `ok: false` 时，才会在新的浏览器页面中打开 LightBox 入口页。
