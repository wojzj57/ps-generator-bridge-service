# API 路由

插件可以用 `@api` 或 initializer 上下文暴露 HTTP handler。

```ts
import { BasePlugin, api, definePlugin } from "@ps-generator-bridge/sdk/plugin";

class PaintPlugin extends BasePlugin {
  @api("/status")
  status() {
    return { ok: true };
  }
}

export default definePlugin("paint", (context) => new PaintPlugin(context));
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

普通对象插件在同步初始化期间注册相同路由：

```ts
import type { PluginInitContext } from "@ps-generator-bridge/sdk/plugin";

export default function init(context: PluginInitContext) {
  context.api("/status", () => ({ ok: true }));
  context.api({ method: "POST", url: "/create" }, () => ({ ok: true }));
  return {};
}
```

路由路径必须以 `/` 开头。支持的方法包括 `GET`、`POST`、`PUT`、`PATCH`、
`DELETE`、`HEAD` 和 `OPTIONS`。重复或格式错误的路由会在插件可用前让激活失败。

## 路由冲突

插件 id 会保留它的第一段路径。模块 API 路由不能使用和已加载插件 id 相同的第一段路径。

这样可以把插件 HTTP 路由稳定地放在：

```text
/{pluginId}/...
```

并防止全局模块路由抢占插件命名空间。

## 内置模块路由

generator 也会在保留的 `/action`、`/document`、`/layer`、`/image`、`/selection`
路径段下暴露内置模块 HTTP 路由。这些路由是现有 Protocol 方法的第二入口，
返回形状复用对应 WebSocket request 方法。

| 方法   | 路由                                     | 输入                                                                  |
| ------ | ---------------------------------------- | --------------------------------------------------------------------- |
| `POST` | `/action/auto-cutout`                    | 无需请求体                                                            |
| `POST` | `/action/remove-background`              | 无需请求体                                                            |
| `GET`  | `/document/current`                      | 无                                                                    |
| `POST` | `/document/export`                       | JSON 请求体，必须包含 `filePath`，并可包含其他导出字段                |
| `POST` | `/document/save`                         | JSON 请求体，可包含 `savePath`                                        |
| `GET`  | `/layer/info`                            | 可选 query 参数：`id`、`index`、`getChildren`、`getGeneratorSettings` |
| `GET`  | `/layer/by-id/:layerID`                  | 可选 query 参数 `getChildren`                                         |
| `GET`  | `/layer/by-index/:layerIndex`            | 可选 query 参数 `getChildren`                                         |
| `GET`  | `/layer/current-preview`                 | 无                                                                    |
| `POST` | `/layer/import-image`                    | `LayerImportImageParams` JSON 请求体；`image` 为必填字段              |
| `POST` | `/image/export-layer`                    | JSON 请求体，必须包含 `layerSpec`；可包含 `documentId`、`settings`    |
| `POST` | `/image/export-layer-with-selected-path` | JSON 请求体，必须包含数值 `layerSpec`；可包含 `documentId`、`expand`  |
| `GET`  | `/image/preview/:layerSpec`              | 可选 query 参数 `documentId`                                          |
| `POST` | `/image/export-document`                 | JSON 请求体，可包含 `documentId`、`settings`                          |
| `GET`  | `/selection/area`                        | 无                                                                    |
| `GET`  | `/selection/path`                        | 可选 query 参数 `expand`                                              |

POST 请求体必须是 JSON 对象。数值型路径参数和 query 参数可以使用数值字符串；
标记为整数的参数不接受小数。布尔 query 参数接受 `true`、`false`、`1` 或 `0`。
无效 JSON、缺少必填字段或参数值无效时，会返回 `400` 和 Protocol 错误体。

图片导出路由返回 `WsImageResult`。其中 `data` 是 `data:image/png;base64,...`
URI；启用 COS 上传时也可能是 HTTPS URL。预览路由始终返回 data URI。其余字段包含
图片的 `bounds`、`width` 和 `height`。

## 错误响应

模块路由使用与 WebSocket 响应相同的 `ProtocolError` 形状序列化错误。HTTP 状态码
由 Protocol 错误码决定：

| HTTP 状态码 | Protocol 错误                                         |
| ----------- | ----------------------------------------------------- |
| `400`       | `BadRequest`，包括无效 JSON 和无效参数                |
| `404`       | `PluginNotFound`、`DocumentNotFound`、`LayerNotFound` |
| `409`       | `NoDocument`、`PhotoshopBusy`                         |
| `503`       | `PhotoshopUnavailable`                                |
| `500`       | 其他服务端错误和 JSX 执行失败                         |

持续事件能力（例如 `selection:change`）仍然通过 WebSocket 事件订阅使用，
不会暴露为 HTTP 路由。
