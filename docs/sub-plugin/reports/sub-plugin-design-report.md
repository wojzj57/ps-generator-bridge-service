# PS Generator Bridge 子插件设计审查报告

生成时间：2026-07-02  
审查范围：`packages/generator`、`packages/sdk`

## 1. 结论摘要

当前代码中的“子插件”实际是外部插件包：由 `packages/generator` 在 Photoshop Generator 进程内从插件目录加载，由 `@ps-generator-bridge/sdk/plugin` 提供作者侧基类、装饰器和类型契约。整体设计已经形成了清晰的三层边界：

1. `sdk/protocol`：内建协议的单一事实源；插件私有方法保持开放字符串，不进入主协议表。
2. `sdk/plugin`：插件作者 API，包含 `BasePlugin`、`@ws`、`@api`、`bootstrap`、`PluginHost`。
3. `generator/server`：运行时宿主，负责插件发现、构造、注册、路由、WebSocket 派发和客户端隔离。

当前设计最强的部分是作用域隔离：每个插件有独立 `ScopedRegistry` 和 `ClientStore`，`/ws/{pluginId}` 连接先查插件 scoped handler，再 fallback 到全局 Registry；插件 `broadcast/send` 只触达本插件客户端，不会泄漏到其他插件。

主要不足是生命周期还偏轻：目前没有显式 `onInit`、`onDispose`、`onUnload`、热重载、依赖声明、权限声明或插件 manifest 能力描述。插件构造、注册、客户端连接/断开就是主要生命周期。

## 2. 关键源码地图

| 主题 | 关键文件 | 作用 |
| --- | --- | --- |
| 插件作者入口 | `packages/sdk/src/plugin/index.ts` | 导出 `BasePlugin`、装饰器、host/type 契约 |
| 插件基类 | `packages/sdk/src/plugin/base.ts` | 插件 id、host 访问、JSX、事件、Photoshop proxy、client bus、连接钩子 |
| 装饰器注册 | `packages/sdk/src/plugin/decorators.ts` | 收集 `@ws/@api` 元数据并通过 `bootstrap` 注册到装配目标 |
| 插件宿主契约 | `packages/sdk/src/plugin/host.ts` | 限定插件可见能力：modules、jsx、events、cos |
| 运行时宿主 | `packages/generator/src/plugin.ts` | `PsBridgeHost.init` 创建 server、加载插件、注册模块、启动服务 |
| 插件发现/加载 | `packages/generator/src/plugins/pluginLoader.ts` | 扫描插件目录、读取 package.json、动态 import、校验并构造插件 |
| 插件管理器 | `packages/generator/src/plugins/pluginManager.ts` | 每插件 scoped registry、client store、API 路由前缀和 bus 注入 |
| 插件 scoped 派发 | `packages/generator/src/plugins/scopedRegistry.ts` | 插件私有 WS 方法表和 API route 收集 |
| 插件域导出 | `packages/generator/src/plugins/index.ts` | 对 server/host 暴露插件管理域的稳定导出口 |
| 客户端存储工具 | `packages/generator/src/utils/clientStore.ts` | root 与插件 WebSocket 共用的 clientId、订阅和事件推送状态工具 |
| 全局派发 | `packages/generator/src/server/registry.ts` | 内建模块/全局方法表，插件连接的 fallback |
| WebSocket 服务 | `packages/generator/src/server/index.ts` | `/ws`、`/ws/:pluginId`、handshake、派发、连接生命周期 |
| 事件桥 | `packages/generator/src/utils/eventManager.ts`、`server/eventHub.ts` | Photoshop 事件懒订阅、root 客户端事件桥 |
| 客户端发现 | `packages/sdk/src/publicConnection.ts` | `connection.plugin.list()/has()` 基于 `getServerInfo().plugins` |

## 3. 设计框架

### 3.1 分层关系

```text
External Plugin Package
  extends BasePlugin
  uses @ws/@api
  depends on @ps-generator-bridge/sdk/plugin
        |
        v
SDK plugin authoring surface
  BasePlugin / PluginHost / decorators / bootstrap
        |
        v
Generator runtime host
  loadPlugins -> PluginManager.register -> ScopedRegistry
        |
        v
Server endpoints
  GET /plugins
  WS /ws
  WS /ws/{pluginId}
  HTTP /{pluginId}/{pluginRoute}
```

### 3.2 依赖方向

设计上尽量保持 `generator -> sdk` 的运行时依赖方向。插件作者只依赖 `@ps-generator-bridge/sdk/plugin`，不会直接拿到 Fastify、generator-core、COS SDK 具体类或 server 内部对象。插件可见宿主能力由 `PluginHost` 收窄：

- `modules.layer/document/action/image`
- 插件目录 scoped 的 `jsx`
- typed listen-only `events`
- 可选 `cos`

`packages/generator/src/contract.ts` 是 generator 暴露给 SDK 的 type-only 契约出口，用于保证插件作者看到的模块/JSX/事件类型与实现同步。

### 3.3 插件作用域模型

插件没有独立进程或沙箱。它们运行在同一个 Node runtime 内，但在协议层做作用域隔离：

- 插件 WS 方法注册进自己的 `ScopedRegistry`。
- 插件 HTTP route 注册为 `/{pluginId}/{route.url}`。
- 插件客户端存放在自己的 `ClientStore`。
- 插件 `broadcast/send` 只发给本插件的 `/ws/{pluginId}` 客户端。
- `/ws/{pluginId}` 的请求派发顺序是 scoped first，然后 fallback 到全局 Registry。

## 4. 子插件加载/发现

### 4.1 插件目录来源

`PsBridgeHost.onInit` 中确定插件目录，优先级如下：

1. `PluginConfig.pluginsDir`
2. `PS_BRIDGE_PLUGINS_DIR`
3. 默认 `join(__dirname, "..", "plugins")`

这个目录由 `loadPlugins` 扫描。缺失目录被视为“未安装插件”的正常状态，只 debug log，不会失败启动。

### 4.2 发现规则

`loadPlugins` 只扫描插件目录的直接子目录：

- 只看一层，不递归。
- 跳过 `node_modules`。
- 跳过点号开头目录。
- 排序后加载，保证确定性顺序。

每个子目录必须是一个 npm 风格 package：

- 必须有可解析的 `package.json`。
- `package.json.main` 必须存在且为非空字符串。
- `main` 解析后的入口不能逃出插件目录。
- 通过 `dynamic import(file://entry)` 加载。
- 支持 CommonJS interop：`module.exports = Class` 和 `module.exports.default = Class`。

### 4.3 校验规则

加载后必须满足：

- 默认导出是 `BasePlugin` 子类。
- 子类有非空 `static id`。
- id 匹配 `/^[A-Za-z0-9_-]+$/`。
- id 在本次加载中唯一，且不能与 `knownIds` 冲突。

跨 bundle 校验依赖全局 brand：

- `BasePlugin.prototype` 带 `Symbol.for("ps-generator-bridge.BasePlugin")`。
- `isBasePluginClass` 不用 `instanceof`，所以外部插件即使 bundled 了自己的 SDK copy 也能识别。

### 4.4 失败处理

坏插件不会阻塞其他插件：

- 单个插件异常返回 `SkippedPlugin`。
- 日志记录 `plugin skipped` 和原因。
- 继续加载后续插件。

测试覆盖包括缺 package.json、无 main、main 逃逸、入口缺失、非 BasePlugin、缺 id、非法 id、重复 id、加载抛错、忽略 node_modules/dotfolder、插件自带 node_modules 依赖解析。

## 5. 子插件生命周期

### 5.1 当前生命周期状态机

```text
Host construction
  -> modules/jsx/events/cos constructed
  -> createServer()
  -> loadPlugins()
       -> hostFor(pluginDir)
       -> new PluginClass(id, host)
  -> PluginManager.register(plugin)
       -> new ScopedRegistry()
       -> new ClientStore()
       -> plugin._attachBus(bus)
       -> bootstrap(plugin, scoped)
       -> register plugin @api routes
  -> reserve plugin ids
  -> bootstrap global modules
  -> jsx.init()
  -> server.listen()
  -> clients connect to /ws/{pluginId}
       -> ClientStore.add()
       -> plugin.onConnect(clientId)
       -> request dispatch
       -> close
       -> ClientStore.remove()
       -> plugin.onDisconnect(clientId)
  -> host.close()
       -> server.close()
```

### 5.2 插件构造期

插件实例通过 `new PluginClass(id, host)` 构造。此时可访问传入的 `PluginHost`，但最佳实践应避免在构造函数中执行重 IO、发起长任务或调用 Photoshop，因为 server 尚未 listen，JSX polyfills 也还未 prime。

当前实现允许插件在构造期订阅 `this.events`，测试中也为这种情况准备了 stub。但这类订阅的释放依赖插件自己调用 `off`，没有统一 dispose 钩子兜底。

### 5.3 注册期

`PluginManager.register` 完成以下动作：

- 校验 id。
- 创建插件自己的 `ScopedRegistry`。
- 创建插件自己的 `ClientStore`。
- 构造 `PluginClientBus`，注入 `plugin._attachBus(bus)`。
- `bootstrap(plugin, scoped)` 把 `@ws/@api` 元数据注册到 scoped 装配目标。
- 把插件 `@api` route 注册到 Fastify，最终路径为 `/{pluginId}{route.url}`。

注册必须发生在 `server.listen()` 前，因为 Fastify HTTP route 需要在 listen 前完成。WS method 表本身可以 runtime 添加，但当前 host 初始化流程统一在 listen 前完成装配。

### 5.4 运行期

客户端连接 `/ws/{pluginId}`：

- 未知插件 id：server 发送 `type: "error"`，code 为 `PLUGIN_NOT_FOUND`，然后关闭 socket。
- 已知插件 id：生成或复用 `?id=` clientId。
- `ClientStore.add` 记录客户端；重复 clientId 会接管旧 socket。
- 调用 `plugin.onConnect(clientId)`。
- 首帧发送 `connected` 事件，包含 clientId。
- 后续 request 先走插件 scoped handler，miss 后 fallback 到全局 Registry。
- socket close 时从 `ClientStore` 移除并调用 `plugin.onDisconnect(clientId)`。

### 5.5 停止期

目前只有 `PsBridgeHost.close()` 关闭 server。没有逐插件 `onDispose/onUnload` 钩子，也没有统一清理插件注册的 Photoshop event listener、timer、文件 watcher、外部连接等资源的框架约束。

## 6. 子插件事件监听和注册

这里有三类“事件/注册”需要分开看。

### 6.1 插件方法注册：`@ws`

插件作者写：

```ts
export default class MyPlugin extends BasePlugin {
  static id = "myPlugin";

  @ws("myPlugin:ping")
  ping(params: unknown) {
    return params;
  }
}
```

`@ws(name)` 只收集 metadata，不立即注册。`bootstrap(instance, target)` 扫描 metadata，把方法 bind 到实例后调用 `target.registerMethod(name, bound)`。

关键点：

- metadata key 是 `Symbol.for("ps-generator-bridge.handlers")`，支持跨 bundle。
- Node 18 缺 `Symbol.metadata`，装饰器模块会用 `Symbol.for("Symbol.metadata")` polyfill。
- 会遍历 metadata prototype chain，因此继承的 handler 会被注册。
- `@ws` 名字原样注册，不自动加插件 id 前缀。
- 同一个 scoped registry 中名称冲突时底层 `Map.set` 会覆盖，开发者需要用 `Domain:action` 约定避免冲突。

### 6.2 插件 HTTP API 注册：`@api`

插件作者写：

```ts
@api({ method: "POST", url: "/create" })
create() {
  return { ok: true };
}
```

`@api` 同样只收集 metadata。插件注册时由 `ScopedRegistry` 收集 route，再由 `PluginManager` flush 到 Fastify：

```text
/{pluginId}{route.url}
```

例如插件 id 为 `echo`、`@api("/status")`，最终 HTTP 路径是 `/echo/status`。

全局模块 route 有保护：如果模块 `@api` 的第一段路径与插件 id 冲突，会在注册时报错。插件 route 天然挂在自己的 id 前缀下。

### 6.3 Photoshop 事件监听：`this.events`

插件可通过 `this.events.on/once/off` 监听 Photoshop 事件。这个 surface 来自 `EventManager`，特点是：

- 类型由 `PhotoshopEventMap` 限定。
- 未知事件名运行时报错。
- 懒订阅：第一个 listener 添加时调用 `generator.onPhotoshopEvent`。
- 最后一个 listener 移除时调用 `generator.removePhotoshopEventListener`。
- `emit` 不在 `PluginHost.events` 暴露面中，插件只能监听，不能伪造 Photoshop 事件。

注意：插件 endpoint `/ws/{pluginId}` 上不能调用内建 `event:subscribe`。`server.test.ts` 明确断言插件 endpoint 调用该方法会得到 `BAD_REQUEST`，因为协议级 Photoshop 事件订阅只为 root `/ws` 的 `Connection.on("imageChanged")` 设计。

### 6.4 插件向客户端推送事件：`broadcast/send`

`BasePlugin.broadcast(type, data)` 和 `send(clientId, type, data)` 通过 `PluginClientBus` 发事件：

- `broadcast` 发给该插件所有在线客户端。
- `send` 只发给指定 clientId。
- 未 attach bus 前是 no-op。
- 不需要客户端先 `event:subscribe`。
- 事件类型是开放字符串，插件可以定义自己的事件表。

SDK 侧 `RawConnection.on(type)` 和 `Connection.on(type)` 都支持自定义事件。`Connection` 只会对 Photoshop 事件自动发送 `event:subscribe`；自定义插件事件只是本地 listener，不触发 server-side subscription。

## 7. 客户端交互模型

### 7.1 Root 连接

默认 SDK `Connection` 连接：

```text
ws://127.0.0.1:7700/ws
```

root `/ws` 只能访问全局 Registry：

- 内建 `getServerInfo`
- JSX run/execute
- Photoshop event subscribe/unsubscribe
- 内建模块方法

root 不能访问插件 scoped 方法。测试覆盖了 root 调用 `echo:ping` 会返回 `UNKNOWN_METHOD`。

### 7.2 插件连接

插件 scoped 连接使用：

```text
ws://host:port/ws/{pluginId}
```

这个连接可以：

- 调用插件 `@ws` 私有方法。
- scoped miss 时调用全局方法，例如 `getServerInfo`。
- 接收该插件通过 `broadcast/send` 推送的自定义事件。

不能：

- 使用协议级 Photoshop event subscription。
- 访问其他插件的 scoped 方法，除非该方法也通过全局 Registry 暴露。

### 7.3 插件发现

服务端提供两种发现入口：

- `GET /plugins` 返回 `{ plugins: [{ id }] }`。
- `getServerInfo` 返回 `ServerInfo.plugins`。

SDK `Connection.plugin.list()` 和 `has(id)` 使用的是 `getServerInfo().plugins`，不是 HTTP `GET /plugins`。

## 8. 功能清单

| 能力 | 当前状态 | 证据 |
| --- | --- | --- |
| 插件目录发现 | 已实现 | `pluginLoader.scanPluginDirs` |
| npm package 加载 | 已实现 | `pluginLoader.loadOne` |
| main 路径逃逸保护 | 已实现 | `resolve(root, pkg.main)` 后检查 prefix |
| 跨 SDK bundle BasePlugin 识别 | 已实现 | `Symbol.for("ps-generator-bridge.BasePlugin")` |
| 插件 id 校验 | 已实现 | `isValidPluginId` |
| 加载失败隔离 | 已实现 | `loadPlugins` 返回 skipped 并继续 |
| 插件 scoped WS 方法 | 已实现 | `ScopedRegistry` + `/ws/:pluginId` |
| 插件 HTTP API 前缀 | 已实现 | `PluginManager.register` |
| 插件客户端隔离 | 已实现 | 每插件 `ClientStore` |
| 插件广播/定向发送 | 已实现 | `BasePlugin.broadcast/send` + bus |
| 客户端连接/断开钩子 | 已实现 | `onConnect/onDisconnect` |
| 插件发现 API | 已实现 | `GET /plugins`、`getServerInfo().plugins` |
| Photoshop 事件 listen-only host surface | 已实现 | `PluginHost.events` |
| 插件显式初始化钩子 | 未实现 | 无 `onInit` |
| 插件显式销毁钩子 | 未实现 | 无 `onDispose/onUnload` |
| 热加载/卸载 | 未实现 | 无 watcher/unregister |
| 插件权限/能力 manifest | 未实现 | 只读取 `package.json.main` |
| 插件版本/描述发现 | 未实现 | `PluginInfo` 只有 `id` |
| 插件间依赖 | 未实现 | 无 dependency graph |

## 9. 现有测试覆盖

关键测试文件：

- `packages/generator/test/pluginLoader.test.ts`
- `packages/generator/test/plugin.test.ts`
- `packages/generator/test/server.test.ts`
- `packages/generator/test/registry.test.ts`
- `packages/sdk/test/plugin.test.ts`
- `packages/sdk/test/publicConnection.test.ts`
- `packages/sdk/test/connection.test.ts`

已覆盖：

- 插件加载成功/失败路径。
- 外部插件依赖自身 `node_modules`。
- scoped `/ws/{id}` handshake 与 dispatch。
- scoped miss fallback 到 global Registry。
- 未知插件 id 返回 `PLUGIN_NOT_FOUND` error event。
- 插件 `@api` route 挂在 `/{pluginId}/{path}`。
- 插件广播不泄漏到其他插件。
- clientId reconnect takeover。
- root `/ws` 不暴露插件 scoped 方法。
- root Photoshop 事件订阅和取消订阅。
- 自定义插件事件无需 server subscription。

未覆盖或可加强：

- 插件构造后长期持有 Photoshop event listener 的释放策略。
- 插件 `onConnect/onDisconnect` 抛错时 server 行为。
- 插件 `@api` route.url 不以 `/` 开头时的行为约束。
- 插件初始化顺序中 `jsx.init()` 前插件构造函数调用 JSX 的失败语义。
- 插件 metadata 同名 handler 覆盖是否应显式报错。

## 10. 设计风险

### 10.1 插件生命周期不完整

插件现在只有构造、注册、连接、断开，没有统一 init/dispose。对于需要注册 Photoshop event、timer、外部 socket、临时文件、缓存的插件，缺少释放入口。

建议新增：

```ts
abstract class BasePlugin {
  onInit?(): Promise<void> | void;
  onDispose?(): Promise<void> | void;
}
```

并由 host 在 `PluginManager.register` 后、`server.listen` 前调用 `onInit`，在 `server.close` 前按逆序调用 `onDispose`。

### 10.2 插件能力发现不足

`PluginInfo` 只有 id，客户端无法知道插件版本、显示名、协议方法、事件类型或 HTTP API。

建议引入轻量 manifest：

```ts
interface PluginManifest {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  ws?: string[];
  events?: string[];
  api?: { method: string | string[]; url: string }[];
}
```

短期可以从 `static manifest` 或 package.json 读取，并扩展 `PluginInfo`。

### 10.3 方法命名冲突静默覆盖

`MethodTable` 基于 `Map.set`，同一 registry 内重复 method 会静默覆盖。虽然插件 scoped 和 global 已隔离，但同一插件内部多个 `@ws` 同名仍可能误覆盖。

建议至少在 development/test 模式下对重复注册 warn 或 throw。

### 10.4 插件运行时无隔离

外部插件与 generator 在同一 Node 进程内运行，一个插件的死循环、全局 monkey patch、内存泄漏或未捕获异步错误会影响宿主。

短期建议：

- 文档明确插件是 trusted code。
- 对 handler dispatch 保持错误归一化。
- 对 lifecycle hook 加超时和错误隔离。

长期可考虑 worker/process 隔离，但这会显著增加 Photoshop Generator 环境复杂度。

### 10.5 插件事件订阅释放依赖作者自律

`EventManager` 本身有引用计数，但插件如果长期不 `off`，host close 不会统一清理插件的监听器。

建议 lifecycle dispose 中提供推荐模式：

```ts
private readonly disposers: Array<() => void> = [];

onInit() {
  const listener = (event) => this.broadcast("imageChanged", event);
  this.events.on("imageChanged", listener);
  this.disposers.push(() => this.events.off("imageChanged", listener));
}

onDispose() {
  for (const dispose of this.disposers.splice(0)) dispose();
}
```

## 11. 推荐的目标设计

### 11.1 插件包结构

```text
plugins/
  my-plugin/
    package.json
    dist/index.cjs
    jsx/
      Action/doSomething.jsx
    node_modules/
```

`package.json`：

```json
{
  "name": "@example/my-plugin",
  "version": "1.0.0",
  "main": "dist/index.cjs",
  "dependencies": {
    "@ps-generator-bridge/sdk": "^x.y.z"
  }
}
```

插件代码：

```ts
import { BasePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

export default class MyPlugin extends BasePlugin {
  static id = "myPlugin";

  @ws("myPlugin:ping")
  ping(params: { n?: number }) {
    return { pong: params.n ?? 0 };
  }

  @api("/status")
  status() {
    return { ok: true };
  }

  override onConnect(clientId: string) {
    this.send(clientId, "ready", { pluginId: this.id });
  }
}
```

### 11.2 推荐运行时流程

```text
1. Host 创建模块、JSX、EventManager、COS。
2. Host 创建 server，但不 listen。
3. Host 扫描 pluginsDir。
4. Loader 为每个插件构造 PluginHost：
   - modules 共享宿主模块
   - events 共享 EventManager
   - jsx scoped 到插件 jsx 目录
   - cos 可选
5. Loader 加载并构造插件。
6. PluginManager 注册插件：
   - attach bus
   - bootstrap @ws/@api
   - 注册 HTTP API
7. Host reserved plugin ids。
8. Host bootstrap 全局模块。
9. Host 初始化 JSX polyfills。
10. Server listen。
11. 客户端通过 root 发现插件，再连接 /ws/{pluginId}。
```

### 11.3 推荐插件作者规范

- `static id` 使用 URL-safe 字符：`[A-Za-z0-9_-]+`。
- `@ws` 方法使用 `pluginId:action` 或 `Domain:action` 命名。
- 插件私有协议类型放在插件自己的 SDK/wrapper 中，不写入主 `ProtocolMethods`。
- 构造函数只保存轻量状态，不调用 Photoshop，不启动后台任务。
- Photoshop 事件监听放到未来的 `onInit`，并在 `onDispose` 清理。
- 自定义 client event 使用插件自有事件名前缀，例如 `myPlugin:ready`。
- 对 `this.plugin.cos` 做存在性判断。
- 不依赖 Fastify、generator-core、server 内部类。

## 12. 后续改进路线

### 阶段 1：文档和约束补强

- 在 README 或 `docs/sub-plugin/` 下增加插件开发指南。
- 明确插件是 trusted in-process code。
- 明确构造函数不做 IO/PS 调用。
- 文档化 root `/ws` 与 `/ws/{pluginId}` 的区别。

### 阶段 2：生命周期补齐

- 增加 `onInit/onDispose`。
- Host 在 listen 前调用 `onInit`。
- Server close 前调用 `onDispose`。
- hook 错误进入 logger，单插件失败不影响其他插件时需要定义策略。

### 阶段 3：插件发现信息增强

- 扩展 `PluginInfo`。
- 支持 `static manifest` 或读取 package metadata。
- SDK `connection.plugin.list()` 返回更丰富信息。

### 阶段 4：注册安全性增强

- 对同一 scoped registry 内重复 `@ws` 名称报错或 warn。
- 校验 `@api` url 必须以 `/` 开头。
- 增加 route 冲突测试。

### 阶段 5：高级运行时能力

- 插件热加载/卸载。
- 插件依赖排序。
- 插件权限声明。
- 可选进程/worker 隔离。

## 13. 需求覆盖核对

| 用户要求 | 覆盖情况 |
| --- | --- |
| 审查 `packages/generator` | 已覆盖 loader、host、server、manager、registry、events、tests |
| 审查 `packages/sdk` | 已覆盖 protocol、plugin devkit、connection、publicConnection、tests |
| 子插件加载/发现 | 第 4 节 |
| 子插件生命周期 | 第 5 节 |
| 子插件事件监听和注册 | 第 6 节 |
| 子插件设计等 | 第 3、7、8、10、11、12 节 |
| 输出完整报告到 `/docs/sub-plugin/reports/` | 当前文件 |
