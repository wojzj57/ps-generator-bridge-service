# 错误

协议请求要么 resolve result，要么根据服务端响应 reject error。

## 协议错误形状

```ts
interface ProtocolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  source?: "protocol" | "generator" | "photoshop" | "jsx" | "plugin" | "cos" | "sdk";
  requestId?: string;
  method?: string;
  pluginId?: string;
}
```

服务端级别错误码包括：

- `UNKNOWN_METHOD`
- `BAD_REQUEST`
- `INTERNAL`
- `NO_DOCUMENT`
- `DOCUMENT_NOT_FOUND`
- `LAYER_NOT_FOUND`
- `PHOTOSHOP_UNAVAILABLE`
- `PHOTOSHOP_BUSY`
- `JSX_FAILED`
- `PLUGIN_NOT_FOUND`
- `PLUGIN_LOAD_FAILED`
- `COS_UPLOAD_FAILED`

插件专属错误可以使用插件自己定义的 `code`。协议把 `code` 保持为字符串，所以插件包可以定义自己的错误目录。

## 处理错误

```ts
try {
  await connection.modules.document.getCurrentDocument();
} catch (error) {
  console.error(error);
}
```

处理 SDK 错误实例时，可以使用 SDK helper：

```ts
import { isPsBridgeError, isRetryableBridgeError } from "@ps-generator-bridge/sdk";

if (isPsBridgeError(error)) {
  console.log(error.code, error.message);
}

if (isRetryableBridgeError(error)) {
  // 按自己的策略重试
}
```

## 连接失败

如果重连次数耗尽或连接被关闭，`ready()` 会 reject。

如果请求已经写入 transport，但在收到响应前连接中断或被手动替换，该请求会以 `ConnectionInterruptedError` reject。SDK 不会自动重放，因为服务端操作可能已经完成。

`Connection.status()` 不同于 WebSocket 调用：它会捕获 fetch、HTTP 和 malformed response 错误，并返回 `{ ok: false, error }`。
