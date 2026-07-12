# API Routes

Plugins can expose HTTP handlers with `@api`.

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

The route is mounted under the plugin id:

```text
GET /paint/status
```

## HTTP Method

Use the object form to choose a method:

```ts
@api({ method: "POST", url: "/create" })
create(params: unknown) {
  return { ok: true };
}
```

## Route Collisions

Plugin ids reserve their first path segment. A module API route cannot use the same first segment as a loaded plugin id.

This keeps plugin HTTP routes under:

```text
/{pluginId}/...
```

and prevents global module routes from stealing plugin namespaces.

## Built-In Module Routes

The generator also exposes built-in module HTTP routes under the reserved
`/action`, `/document`, `/layer`, `/image`, and `/selection` segments. These
routes are second entry points for existing Protocol methods and reuse the same
result shapes as the corresponding WebSocket request methods.

| Method | Route                                    | Input                                                                              |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST` | `/action/auto-cutout`                    | No body required                                                                   |
| `POST` | `/action/remove-background`              | No body required                                                                   |
| `GET`  | `/document/current`                      | None                                                                               |
| `POST` | `/document/export`                       | JSON body with required `filePath` and optional export fields                      |
| `POST` | `/document/save`                         | JSON body with optional `savePath`                                                 |
| `GET`  | `/layer/info`                            | Optional `id`, `index`, `getChildren`, and `getGeneratorSettings` query parameters |
| `GET`  | `/layer/by-id/:layerID`                  | Optional `getChildren` query parameter                                             |
| `GET`  | `/layer/by-index/:layerIndex`            | Optional `getChildren` query parameter                                             |
| `GET`  | `/layer/current-preview`                 | None                                                                               |
| `POST` | `/layer/import-image`                    | `LayerImportImageParams` JSON body; `image` is required                            |
| `POST` | `/image/export-layer`                    | JSON body with required `layerSpec`; optional `documentId` and `settings`          |
| `POST` | `/image/export-layer-with-selected-path` | JSON body with required numeric `layerSpec`; optional `documentId` and `expand`    |
| `GET`  | `/image/preview/:layerSpec`              | Optional `documentId` query parameter                                              |
| `POST` | `/image/export-document`                 | JSON body with optional `documentId` and `settings`                                |
| `GET`  | `/selection/area`                        | None                                                                               |
| `GET`  | `/selection/path`                        | Optional `expand` query parameter                                                  |

POST bodies must be JSON objects. Numeric path and query parameters accept
numeric strings; parameters documented as integers reject fractional values.
Boolean query parameters accept `true`, `false`, `1`, or `0`. Invalid JSON,
missing required fields, and invalid parameter values return `400` with a
Protocol error body.

Image export routes return `WsImageResult`. Its `data` field is either a
`data:image/png;base64,...` URI or, when COS upload is enabled, an HTTPS URL.
The preview route always returns a data URI. The remaining fields contain the
image `bounds`, `width`, and `height`.

## Error Responses

Module routes serialize errors with the same `ProtocolError` shape used by
WebSocket responses. The HTTP status is selected from the Protocol error code:

| HTTP status | Protocol errors                                               |
| ----------- | ------------------------------------------------------------- |
| `400`       | `BadRequest`, including malformed JSON and invalid parameters |
| `404`       | `PluginNotFound`, `DocumentNotFound`, `LayerNotFound`         |
| `409`       | `NoDocument`, `PhotoshopBusy`                                 |
| `503`       | `PhotoshopUnavailable`                                        |
| `500`       | Other server and JSX failures                                 |

Long-lived event capabilities, such as `selection:change`, stay on WebSocket
event subscription instead of HTTP.
