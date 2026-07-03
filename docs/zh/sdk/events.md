# 事件

`Connection.on()`、`Connection.once()` 和 `Connection.off()` 会注册本地 listener，并通过 `event:subscribe` 和 `event:unsubscribe` 同步到服务端。

## Listener 行为

某个事件类型的第一个 listener 会发送远程订阅请求：

```ts
connection.on("imageChanged", listener);
```

同一个事件类型再添加其他 listener，不会重复发送订阅请求。

当某个事件类型的最后一个 listener 被移除时，SDK 会发送 `event:unsubscribe`：

```ts
connection.off("imageChanged", listener);
```

`once()` 在收到第一个匹配事件后移除 wrapper；如果没有其它 listener，会取消订阅。

## 重连行为

活跃订阅会在重连后重放。如果断线时订阅请求仍在 pending，SDK 会重置 pending 状态，并在下一次握手后重新发送订阅。

## 事件域

Root endpoint 连接可以订阅：

- Photoshop 事件
- 主 `#` 事件，例如 `#ready` 和 `#closing`

插件 endpoint 连接可以订阅：

- Photoshop 事件
- 主 `#` 事件
- 当前插件发出的插件本地事件名

Root endpoint 连接不能订阅插件本地事件名。服务端会用协议错误拒绝这类订阅。

## Photoshop 事件

已类型化的 Photoshop 事件名包括：

- `workspaceChanged`
- `toolChanged`
- `quickMaskStateChanged`
- `documentChanged`
- `closedDocument`
- `newDocumentViewCreated`
- `activeViewChanged`
- `currentDocumentChanged`
- `backgroundColorChanged`
- `foregroundColorChanged`
- `imageChanged`

示例：

```ts
connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});
```

## 主事件

主事件是服务端拥有的进程事件：

```ts
connection.on("#ready", (event) => {
  console.log(event.port, event.plugins);
});

connection.on("#closing", (event) => {
  console.log(event.reason);
});
```

## 插件事件

插件本地事件是开放字符串名。订阅前先连接到插件 endpoint：

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});
```

插件通过事件门面发布：

```ts
this.events.emit("paint:changed", { layerId: 7 });
```
