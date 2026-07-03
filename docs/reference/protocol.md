# Protocol Reference

The SDK package owns the protocol contract in `packages/sdk/src/protocol.ts`.

## Version

```ts
export const PROTOCOL_VERSION = 1;
```

## Frame Kinds

Request:

```ts
{
  id: string;
  method: string;
  params: unknown;
}
```

Response:

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

Event:

```ts
{
  type: string;
  data: unknown;
}
```

Events have no `id` and no direct response.

## Built-in Methods

| Method                    | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `getServerInfo`           | Server identity, Photoshop version when available, loaded plugins. |
| `jsx:run`                 | Run an inline JSX script.                                          |
| `jsx:execute`             | Execute a named JSX resource with params.                          |
| `event:subscribe`         | Subscribe the logical client to an event type.                     |
| `event:unsubscribe`       | Remove that event subscription.                                    |
| `action:autoCutout`       | Run auto cutout action.                                            |
| `action:removeBackground` | Run remove background action.                                      |
| `layer:getInfo`           | Inspect layer information.                                         |
| `layer:getInfoById`       | Inspect layer by id.                                               |
| `layer:getInfoByIndex`    | Inspect layer by index.                                            |
| `document:current`        | Get current document information.                                  |
| `document:export`         | Export document.                                                   |
| `document:save`           | Save document.                                                     |
| `image:exportLayer`       | Export a layer image result.                                       |
| `image:getPreview`        | Get a layer preview image result.                                  |
| `image:exportDocument`    | Export a document image result.                                    |

Plugin-specific methods are open string names and are invoked through `connection.invoke(...)` on plugin endpoint connections.

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
```

## Main Events

```ts
"#ready": {
  port: number;
  plugins: PluginInfo[];
}

"#closing": {
  reason: "host-close" | "process-exit";
}
```

## Error Shape

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

## Helpers

The SDK exports helpers for frame handling:

```ts
parseFrame(data);
serializeFrame(value);
isRequest(value);
isResponse(value);
isEvent(value);
```
