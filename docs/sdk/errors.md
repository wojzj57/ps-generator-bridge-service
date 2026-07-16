# Errors

Protocol requests resolve with a result or reject with an error shaped by the server response.

## Protocol Error Shape

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

Server-level codes include:

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
- `PLUGIN_REGISTRATION_FAILED`
- `PLUGIN_LIFECYCLE_FAILED`
- `COS_UPLOAD_FAILED`

Plugin-specific errors may use plugin-owned `code` values. The protocol keeps `code` as a string so plugin packages can define their own error catalog.

Plugin loading errors include a diagnostic `details.phase` such as `manifest`,
`import`, `identity`, `init`, `runtime-validation`, or `registration`, together
with a public `reason`. Lifecycle failures identify `onConnect`, `onDisconnect`,
or `onDispose`. Full third-party stacks stay in generator logs; health responses
expose only protocol-safe diagnostics.

## Handling Errors

```ts
try {
  await connection.modules.document.getCurrentDocument();
} catch (error) {
  console.error(error);
}
```

Use SDK helpers when handling SDK error instances:

```ts
import { isPsBridgeError, isRetryableBridgeError } from "@ps-generator-bridge/sdk";

if (isPsBridgeError(error)) {
  console.log(error.code, error.message);
}

if (isRetryableBridgeError(error)) {
  // retry according to your own policy
}
```

## Connection Failures

`ready()` rejects if reconnect attempts are exhausted or the connection is closed.

An in-flight request rejects with `ConnectionInterruptedError` when its transport drops or is manually replaced before a response arrives. The request is never replayed automatically because the server-side operation may already have completed.

`Connection.status()` is different from WebSocket calls: it catches fetch, HTTP, and malformed response failures and returns `{ ok: false, error }`.
