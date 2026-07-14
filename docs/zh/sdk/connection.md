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

调用方可以在创建 root 或插件连接时指定稳定身份：

```ts
const root = new Connection({ clientId: "lightbox-editor" });
const paint = new Connection("paint", { clientId: "lightbox-editor" });
```

服务端握手后：

```ts
connection.clientId;
```

未指定 id 时，服务端会在第一个 `connected` 事件中分配 `clientId`。重连时，SDK 通过
`?clientId=` 发送当前 id，让服务端把新 socket 识别为同一个逻辑客户端。服务端仍兼容旧的
`?id=` 写法。

客户端 id 由 1–128 个字母、数字或 `.`、`:`、`-`、`_` 字符组成，并按 endpoint 隔离：
同一个 id 可以同时连接 root 和多个插件 endpoint。在同一个 endpoint 内，新 socket 会接管相同
id 的旧 socket，并保留事件订阅。客户端 id 只是身份标签，不是认证凭据。

`connection.id` 不是公开 `Connection` API。

## 就绪状态

```ts
await connection.ready();
```

`ready()` 在收到 `connected` 握手后 resolve。`invoke()` 会等待连接就绪，并在短暂重连期间排队。

## 手动重连

```ts
await connection.reconnect();
```

`reconnect()` 会立即替换已就绪的 socket、复用当前 `clientId`、等待新的握手并恢复事件订阅。
连接过程中的重复调用会等待同一轮连接。自动重试耗尽后可以手动恢复，但 `close()` 后不能重新打开
同一个实例。

## 关闭

```ts
connection.close();
```

`close()` 会停止重连并拒绝未完成的工作。

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
