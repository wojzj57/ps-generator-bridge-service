# Protocol Reference

The SDK package owns the protocol contract in `packages/sdk/src/protocol/`.

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

| Method                              | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `getServerInfo`                     | Server identity, Photoshop version when available, loaded plugins. |
| `jsx:run`                           | Run an inline JSX script.                                          |
| `jsx:execute`                       | Execute a named JSX resource with params.                          |
| `event:subscribe`                   | Subscribe the logical client to an event type.                     |
| `event:unsubscribe`                 | Remove that event subscription.                                    |
| `action:autoCutout`                 | Run auto cutout action.                                            |
| `action:removeBackground`           | Run remove background action.                                      |
| `layer:getInfo`                     | Inspect layer information.                                         |
| `layer:getInfoById`                 | Inspect layer by id.                                               |
| `layer:getInfoByIndex`              | Inspect layer by index.                                            |
| `layer:getInfoBySelectionIndex`     | Inspect layer by Photoshop selection index.                        |
| `layer:getCurrentPreview`           | Get the current selected layer preview payload.                    |
| `layer:importImage`                 | Validate and import an image source into Photoshop as a layer.     |
| `document:current`                  | Get current document information.                                  |
| `document:export`                   | Export document.                                                   |
| `document:save`                     | Save document.                                                     |
| `image:exportLayer`                 | Export a layer image result.                                       |
| `image:exportLayerWithSelectedPath` | Export a layer image with the current selection path overlay.      |
| `image:getPreview`                  | Get a layer preview image result.                                  |
| `image:exportDocument`              | Export a document image result.                                    |
| `selection:getArea`                 | Get the current rectangular selection area, or `null`.             |
| `selection:getPath`                 | Get the current selection path as SVG metadata, or `null`.         |
| `selection:change`                  | Register the generator-side selection change watcher.              |

Plugin-specific methods are open string names and are invoked through `connection.invoke(...)` on plugin endpoint connections.

## HTTP APIs

| Endpoint                                      | Purpose                                                         |
| --------------------------------------------- | --------------------------------------------------------------- |
| `GET /health`                                 | Service liveness probe.                                         |
| `GET /plugins`                                | Loaded plugin discovery.                                        |
| `GET /plugins/{id}/health`                    | Loaded plugin runtime status or failed load diagnosis.          |
| `POST /action/auto-cutout`                    | Run `action:autoCutout`; returns `boolean`.                     |
| `POST /action/remove-background`              | Run `action:removeBackground`; returns `{ success }`.           |
| `GET /document/current`                       | Run `document:current`; returns `PsDocument`.                   |
| `POST /document/export`                       | Run `document:export`; body is the WS params.                   |
| `POST /document/save`                         | Run `document:save`; body is `{ savePath? }`.                   |
| `GET /layer/info`                             | Run `layer:getInfo`; params come from query string.             |
| `GET /layer/by-id/{layerID}`                  | Run `layer:getInfoById`; `getChildren` is a query arg.          |
| `GET /layer/by-index/{layerIndex}`            | Run `layer:getInfoByIndex`; `getChildren` is a query arg.       |
| `GET /layer/current-preview`                  | Run `layer:getCurrentPreview`.                                  |
| `POST /layer/import-image`                    | Run `layer:importImage`; body is `LayerImportImageParams`.      |
| `POST /image/export-layer`                    | Run `image:exportLayer`; body is the WS params.                 |
| `POST /image/export-layer-with-selected-path` | Run `image:exportLayerWithSelectedPath`; body is the WS params. |
| `GET /image/preview/{layerSpec}`              | Run `image:getPreview`; `documentId` is a query arg.            |
| `POST /image/export-document`                 | Run `image:exportDocument`; body is the WS params.              |
| `GET /selection/area`                         | Run `selection:getArea`; returns `PsRect \| null`.              |
| `GET /selection/path`                         | Run `selection:getPath`; `expand` is a query arg.               |

Module HTTP APIs reuse the corresponding WS result shape. `selection:change`
remains a WS/event capability because HTTP cannot carry the ongoing selection
change stream.

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

Failed plugin health may report `load` or `registration` checks. A loaded plugin
can remain available with a failed `runtime` check after a contained lifecycle
hook error. `lastError` uses `PLUGIN_LOAD_FAILED`,
`PLUGIN_REGISTRATION_FAILED`, or `PLUGIN_LIFECYCLE_FAILED` as appropriate.

## Main Events

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
