# 插件事件

插件使用 `this.events` 监听 Photoshop、主事件和插件本地事件。插件通过 `this.events.emit(...)` 发布客户端可见的插件本地事件。

## 监听事件

```ts
this.events.on("imageChanged", (event) => {
  console.log(event.id);
});

this.events.on("#ready", (event) => {
  console.log(event.port, event.plugins);
});

this.events.on("paint:changed", (event) => {
  console.log(event);
});
```

## 发布插件本地事件

```ts
this.events.emit("paint:changed", {
  layerId: 7,
});
```

只有连接到当前插件 endpoint 的客户端才能订阅该插件本地事件名。

## 客户端订阅

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});
```

第一个 listener 添加时，SDK 会发送 `event:subscribe`。generator 只会把事件发送给已订阅的逻辑客户端。

## 已移除的直接推送 API

插件不应使用直接 `broadcast` 或 `send` 方法。客户端可见事件通过插件事件门面流转，并要求远程客户端通过协议订阅。
