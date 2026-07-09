# 协议参考

SDK 包在 `packages/sdk/src/protocol/` 中拥有协议契约。

## 版本

```ts
export const PROTOCOL_VERSION = 1;
```

## 帧类型

Request：

```ts
{
  id: string;
  method: string;
  params: unknown;
}
```

Response：

```ts
{
  id: string;
  ok: true;
  result: unknown;
}
{
  id: string;
  ok: false;
  error: ProtocolError;
}
```

Event：

```ts
{
  type: string;
  data: unknown;
}
```

Event 没有 `id`，也没有直接响应。

## 内置方法

| 方法                                | 作用                                            |
| ----------------------------------- | ----------------------------------------------- |
| `getServerInfo`                     | 服务身份、可用时的 Photoshop 版本、已加载插件。 |
| `jsx:run`                           | 执行内联 JSX 脚本。                             |
| `jsx:execute`                       | 带参数执行命名 JSX 资源。                       |
| `event:subscribe`                   | 让逻辑客户端订阅事件类型。                      |
| `event:unsubscribe`                 | 移除该事件订阅。                                |
| `action:autoCutout`                 | 执行自动抠图 action。                           |
| `action:removeBackground`           | 执行移除背景 action。                           |
| `layer:getInfo`                     | 检查 layer 信息。                               |
| `layer:getInfoById`                 | 按 id 检查 layer。                              |
| `layer:getInfoByIndex`              | 按 index 检查 layer。                           |
| `layer:getInfoBySelectionIndex`     | 按 Photoshop selection index 检查 layer。       |
| `layer:getCurrentPreview`           | 获取当前选中 layer 的预览 payload。             |
| `layer:importImage`                 | 校验图片源并导入 Photoshop 为 layer。           |
| `document:current`                  | 获取当前文档信息。                              |
| `document:export`                   | 导出文档。                                      |
| `document:save`                     | 保存文档。                                      |
| `image:exportLayer`                 | 导出 layer 图片结果。                           |
| `image:exportLayerWithSelectedPath` | 导出带当前选择路径叠加层的 layer 图片。         |
| `image:getPreview`                  | 获取 layer 预览图片结果。                       |
| `image:exportDocument`              | 导出 document 图片结果。                        |
| `selection:getArea`                 | 获取当前矩形选区区域，或返回 `null`。           |
| `selection:getPath`                 | 获取当前选择路径的 SVG 元数据，或返回 `null`。  |
| `selection:change`                  | 注册 generator 侧选择变化 watcher。             |

插件专属方法是开放字符串名，通过插件 endpoint 连接上的 `connection.invoke(...)` 调用。

## HTTP API

| Endpoint                   | 作用                               |
| -------------------------- | ---------------------------------- |
| `GET /health`              | 服务存活检查。                     |
| `GET /plugins`             | 已加载插件发现。                   |
| `GET /plugins/{id}/health` | 已加载插件运行状态或加载失败诊断。 |

## Server Info

```ts
interface ServerInfo {
  name: string;
  version: string;
  psVersion?: string;
  plugins?: PluginInfo[];
}

interface PluginInfo {
  id: string;
}

type PluginStatus = "loaded" | "failed";

type PluginHealthCheck = "ok" | "failed" | "skipped";

interface PluginHealth {
  id: string;
  status: PluginStatus;
  clients: number;
  loadedAt?: number;
  lastError?: ProtocolError;
  checks?: Record<string, PluginHealthCheck>;
}
```

## 主事件

```ts
"#ready": {
  port: number;
  plugins: PluginInfo[];
}

"#closing": {
  reason: "host-close" | "process-exit";
}

"selection:changed": PsRect | null;

"layer:previewChange": LayerPreviewPayload;

"layer:selectionChange": PsLayer[] | null;
```

## 错误形状

```ts
interface ProtocolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  source?: ErrorSource;
  requestId?: string;
  method?: string;
  pluginId?: string;
}
```

## Helper

SDK 导出帧处理 helper：

```ts
parseFrame(data);
serializeFrame(value);
isRequest(value);
isResponse(value);
isEvent(value);
```
