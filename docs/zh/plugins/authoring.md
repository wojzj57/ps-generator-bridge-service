# 插件开发

外部插件使用 `@ps-generator-bridge/sdk/plugin`。

```ts
import { BasePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

export default class MyPlugin extends BasePlugin {
  static id = "myPlugin";

  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }

  @api("/status")
  status() {
    return { ok: true };
  }
}
```

## 包形状

generator 会从插件目录的直接子目录加载插件包。每个插件包需要：

- `package.json`
- `main` 入口
- 默认导出一个继承 `BasePlugin` 的 class
- 静态 `id`

插件 id 是路由和 endpoint 身份。已加载插件之间必须唯一。如果两个插件目录声明
了同一个 id，后加载的目录会被跳过，加载诊断会指出已占用该 id 的目录或保留 id。

## Decorators

`@ws(name)` 会在插件 scoped registry 中注册 WebSocket 协议方法：

```ts
@ws("paint:createSession")
createSession(params: { documentId: number }) {
  return { id: "session-1" };
}
```

插件 endpoint 分发规则是先查 scoped 方法，再 fallback 到全局方法。插件连接可以调用插件方法，也可以调用内置模块方法。

`@api(url)` 会在 `/{pluginId}` 下注册 HTTP 路由：

```ts
@api("/status")
status() {
  return { ok: true };
}
```

## Host 能力

在 `BasePlugin` 内使用 protected 快捷入口：

```ts
this.modules;
this.events;
this.jsx;
this.photoshop;
```

宿主契约也通过 protected `plugin` 字段暴露可选 `cos`：

```ts
if (this.plugin.cos) {
  const url = await this.plugin.cos.uploadObject(bytes, "preview");
}
```

## 生命周期

`@ws` handler 可以接收第二个与平台无关的上下文参数：

```ts
import type { WsHandlerContext } from "@ps-generator-bridge/sdk/plugin";

@ws("paint:run")
run(params: unknown, context: WsHandlerContext): unknown {
  return { clientId: context.clientId, endpoint: context.session.endpoint };
}
```

`context.session` 只暴露 `clientId` 和 endpoint 元数据，原始 socket 保留在 generator 内部。

```ts
onConnect(clientId: string): void {}
onDisconnect(clientId: string): void {}
onDispose?(): void | Promise<void>;
```

新逻辑会话完成握手后只调用一次 `onConnect`。意外断线默认保留 30 分钟用于恢复，因此不会调用 `onDisconnect`；恢复成功也不会调用两个 hook。显式调用 SDK `close()` 或恢复 TTL 到期后调用 `onDisconnect`。宿主关闭时、事件资源释放前调用 `onDispose`。
