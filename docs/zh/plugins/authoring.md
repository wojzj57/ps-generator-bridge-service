# 插件开发

外部插件使用 `@ps-generator-bridge/sdk/plugin`。插件包默认导出同步 initializer；
initializer 可以返回普通 runtime 对象，也可以返回 `BasePlugin` 子类实例。

```ts
import { BasePlugin, definePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

class MyPlugin extends BasePlugin {
  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }

  @api("/status")
  status() {
    return { ok: true };
  }
}

export default definePlugin("myPlugin", (context) => new MyPlugin(context));
```

## 包形状

generator 会从已配置的插件来源中扫描插件包。每个插件包需要：

- `package.json`
- `main` 入口
- 默认导出的同步 initializer
- 在 initializer 运行前可解析出的插件 id

推荐在 `package.json` 顶层使用 `pluginId`：

```json
{
  "name": "@acme/my-plugin",
  "pluginId": "myPlugin",
  "main": "dist/index.js"
}
```

也可以通过 `definePlugin(id, init)` 在代码中声明 id。身份按以下顺序解析：

1. `package.json.pluginId`
2. `definePlugin` 附加到 initializer 的 id
3. `package.json.name`

manifest 和 initializer 同时声明不同 id 时加载失败。使用 package name fallback
时，名称本身必须匹配 `[A-Za-z0-9_-]+`，因此 `@acme/my-plugin` 这类 scoped name
必须显式声明 `pluginId`。返回的 runtime 可以包含 `pluginId`，但存在时必须与已解析
id 一致。

插件 id 同时是路由和 endpoint 身份。宿主依次加载 `PS_BRIDGE_PLUGINS` 中的显式路径、
`PluginConfig.plugins`，最后加载按名称排序的集合目录子项。第一个完整完成初始化和激活
的候选会占用 id。失败候选不会阻止后续候选尝试同一 id；成功 owner 之后的重复候选会
被跳过。

## Initializer 上下文

`PluginInitContext` 由宿主创建并冻结：

```ts
interface PluginInitContext {
  readonly pluginId: string;
  readonly host: PluginHost;
  ws(name: string, handler: MethodHandler): void;
  api(url: string, handler: ApiHandler): void;
  api(route: { method?: HttpMethod | HttpMethod[]; url: string }, handler: ApiHandler): void;
}
```

普通对象插件可以直接注册 handler：

```ts
import type { PluginInitializer } from "@ps-generator-bridge/sdk/plugin";

const init: PluginInitializer = (context) => {
  context.ws("paint:ping", (params) => ({ params }));
  context.api("/status", () => ({ ok: true }));
  context.api({ method: "POST", url: "/paint" }, () => ({ created: true }));

  return {
    pluginId: context.pluginId,
    onConnect(clientId) {},
    onDisconnect(clientId) {},
    async onDispose() {},
  };
};

export default init;
```

`context.ws()` 和 `context.api()` 只在 initializer 执行期间接受注册。initializer
返回 Promise 会被视为错误，初始化必须严格同步。包顶层代码应只保留 import 和声明，
所有宿主管理的注册都放在 initializer 内完成。

## Decorators

`BasePlugin` 构造函数接收同一个 `PluginInitContext`，并保留 decorator authoring
快捷能力。`@ws(name)` 会在插件 scoped registry 中注册 WebSocket 协议方法：

```ts
@ws("paint:createSession")
createSession(params: { documentId: number }) {
  return { id: "session-1" };
}
```

插件 endpoint 分发规则是先查 scoped 方法，再 fallback 到全局方法。插件连接可以调用
插件方法，也可以调用内置模块方法。

`@api(url)` 会在 `/{pluginId}` 下注册 HTTP 路由：

```ts
@api("/status")
status() {
  return { ok: true };
}
```

直接注册和 decorator 注册会一起暂存。重复或格式错误的注册会在 handler 激活前让当前
插件加载失败。

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

普通对象插件通过 `context.host` 使用同一份窄宿主契约。

## 生命周期

`@ws` handler 可以接收第二个与平台无关的上下文参数：

```ts
import type { WsHandlerContext } from "@ps-generator-bridge/sdk/plugin";

@ws("paint:run")
run(params: unknown, context: WsHandlerContext): unknown {
  return { clientId: context.clientId, endpoint: context.session.endpoint };
}
```

`context.session` 只暴露 `clientId` 和 endpoint 元数据，原始 socket 保留在 generator
内部。

```ts
onConnect?(clientId: string): void;
onDisconnect?(clientId: string): void;
onDispose?(): void | Promise<void>;
```

`onConnect` 和 `onDisconnect` 必须同步。新逻辑会话完成握手后只调用一次
`onConnect`。意外断线默认保留 30 分钟用于恢复，因此不会调用 `onDisconnect`；
恢复成功也不会调用两个 hook。显式调用 SDK `close()` 或恢复 TTL 到期后调用
`onDisconnect`。`onDispose` 可以异步，并在宿主关闭、事件资源释放前调用。

hook 失败会被限制在所属插件内，并体现在插件健康诊断中，不会中断宿主启动、其他
客户端或关闭流程。
