# @ps-generator-bridge/sdk

## 0.3.0

### Minor Changes

- Features

  1. Add `GET /plugins/{id}/health` and `Connection.pluginHealth(id, options?)` so clients can inspect loaded plugin runtime status, client counts, and failed plugin load diagnostics without opening a plugin WebSocket.
  2. Add layer image import and selected-path layer export support to the public module and protocol surfaces.
  3. Add subscribable selection and layer-selection events plus plugin logger bridging for plugin authors and remote clients.

  Fixes

  1. Validate layer image import sources, byte limits, pixel limits, formats, and local-path support before forwarding image data to Photoshop.
  2. Scale layer previews by the longest edge so narrow strip layers no longer produce oversized previews.
  3. Load generator package `.env` configuration during startup and map layer selection indices correctly for Photoshop lookups.

  Documentation

  1. Document plugin health, image import validation, preview scaling, environment behavior, and online documentation entry points in English and Chinese references.

## 0.2.0

### Minor Changes

- Breaking Changes

  - Remove the SDK connection plugin facade and `PluginClientBus`; create plugin-scoped clients with `new Connection(pluginId, options)` and publish plugin events from server plugins through `this.events.emit(...)`.

  Features

  1. Add endpoint-aware `Connection` instances for root and plugin WebSocket paths, including immutable endpoint metadata and plugin-scoped event delivery.
  2. Add `Connection.status(...)` and `Connection.plugins(...)` HTTP helpers for `/health` checks and plugin discovery, with injectable `fetch` support.
  3. Add `openPhotoshopOnLightBox(...)` to the SDK for opening Photoshop documents from LightBox URLs.

  Documentation

  1. Add the VitePress documentation site with setup, SDK connection, plugin authoring, protocol, environment, and troubleshooting guides in English and Chinese.
  2. Document root, Photoshop, and plugin event scopes so clients know which events are available from each endpoint.

## 0.1.2

### Patch Changes

- Harden public Connection event handling for direct WebSocket access.

## 0.1.1
