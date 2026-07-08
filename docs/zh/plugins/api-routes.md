# API 路由

插件可以用 `@api` 暴露 HTTP handler。

```ts
import { BasePlugin, api } from "@ps-generator-bridge/sdk/plugin";

export default class PaintPlugin extends BasePlugin {
  static id = "paint";

  @api("/status")
  status() {
    return { ok: true };
  }
}
```

路由会挂载到插件 id 下面：

```text
GET /paint/status
```

## HTTP 方法

使用对象形式选择方法：

```ts
@api({ method: "POST", url: "/create" })
create(params: unknown) {
  return { ok: true };
}
```

## 路由冲突

插件 id 会保留它的第一段路径。模块 API 路由不能使用和已加载插件 id 相同的第一段路径。

这样可以把插件 HTTP 路由稳定地放在：

```text
/{pluginId}/...
```

并防止全局模块路由抢占插件命名空间。

## 内置模块路由

generator 也会在 `/action`、`/document`、`/layer`、`/image`、`/selection`
这些保留模块路径段下暴露内置模块 HTTP 路由。这些路由是现有 Protocol
方法的第二入口，返回形状复用对应 WebSocket request 方法。

持续事件能力（例如 `selection:change`）仍然通过 WebSocket 事件订阅使用，
不会暴露为 HTTP 路由。
