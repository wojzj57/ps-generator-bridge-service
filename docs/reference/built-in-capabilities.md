# Built-In Capability Matrix

The generator registers the built-in modules declared by
`packages/generator/src/modules/index.ts` in the `MODULES` manifest. A directory
under `modules/` is not a published capability unless it is registered there.

This matrix records whether each logical capability has an official access
surface:

- **SDK** means a typed `Connection.modules.*` facade is available. Generic
  `Connection.invoke(...)` access does not count.
- **Plugin Host** means the capability is part of the typed `plugin.modules.*`
  contract exported for plugin authors.
- **WS** means the capability is registered as a WebSocket Protocol method.
- **HTTP API** means the capability has a registered `@api` route.
- **MCP** is unavailable in the current version. No built-in capability is
  exposed through MCP yet.

A check means the capability has an entry point on that surface. Parameters and
result shapes can differ between surfaces; see [SDK Modules](../sdk/modules.md),
[Protocol](./protocol.md), and [API Routes](../plugins/api-routes.md) for the
surface-specific contract.

## Request Capabilities

| Capability                           | Summary                                                      | SDK | Plugin Host | WS  | HTTP API | MCP |
| ------------------------------------ | ------------------------------------------------------------ | :-: | :---------: | :-: | :------: | :-: |
| `action.autoCutout`                  | Select the main subject of the current layer.                | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `action.removeBackground`            | Remove the background from the current layer.                | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.getCurrentDocument`        | Read metadata for the active document.                       | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.exportDocument`            | Export the active document to a file.                        | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.saveDocument`              | Save the active document, optionally to a new path.          | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfo`                 | Read layer metadata with optional children and settings.     | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoByID`             | Read layer metadata by Photoshop layer ID.                   | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoByIndex`          | Read layer metadata by document layer index.                 | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoBySelectionIndex` | Read layer metadata by its index in the current selection.   | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `layer.getCurrentPreview`            | Render a PNG preview for the current layer.                  | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.importImage`                  | Import an image as a layer with optional placement settings. | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportLayer`                  | Export a layer or layer range as PNG image data.             | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportLayerWithSelectedPath`  | Export a layer using the current selected path.              | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.getPreview`                   | Render a PNG preview for a specified layer.                  | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportDocument`               | Export a document as PNG image data.                         | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `selection.watch`                    | Enable production of selection change events.                | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `selection.getArea`                  | Read the bounds of the current selection.                    | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `selection.getPath`                  | Read the current selection path as SVG geometry.             | ✅  |     ✅      | ✅  |    ✅    | ❌  |

## Event Capabilities

Module events use the typed SDK and Plugin Host event facades. Remote SDK
subscriptions travel over WebSocket; events do not have HTTP or MCP entry
points.

| Event                   | Summary                                               | SDK | Plugin Host | WS  | HTTP API | MCP |
| ----------------------- | ----------------------------------------------------- | :-: | :---------: | :-: | :------: | :-: |
| `layer:previewChange`   | Publishes the refreshed current-layer preview.        | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `layer:selectionChange` | Publishes metadata for the selected Photoshop layers. | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `selection:changed`     | Publishes the current selection bounds after changes. | ✅  |     ✅      | ✅  |    ❌    | ❌  |
