# @ps-generator-bridge/generator

## 0.6.0

### Minor Changes

- Breaking Changes

  - Remove caller-selected `?id=` WebSocket identities; clients now resume only with a previously server-issued `clientId` through `?resume=`.

  Features

  1. Add server-issued logical WebSocket sessions with resume takeover, explicit-close disposal, and a configurable unexpected-disconnect TTL.
  2. Expose platform-neutral client and endpoint session context to plugin WebSocket handlers without leaking the raw socket.

  Fixes

  1. Load plugin packages linked through symlinks or Windows junctions while preserving existing dot-directory and `node_modules` exclusions.

  Documentation

  1. Document session lifecycle hooks, resume behavior, TTL configuration, and handler context in the paired English and Chinese guides.

## 0.5.0

### Minor Changes

- Features

  1. Expose the built-in action, document, layer, image, and selection capabilities through HTTP routes that reuse the existing module implementations and Protocol result shapes.
  2. Include `.env.example` and `CHANGELOG.md` in the Generator package so the CLI can install a complete standalone runtime.

  Fixes

  1. Preserve Fastify client-error status codes and return Protocol `BadRequest` responses for malformed JSON and invalid HTTP parameters.

  Documentation

  1. Add bilingual HTTP route references and a capability matrix comparing SDK, Plugin Host, WebSocket, HTTP API, and MCP availability.

## 0.4.0

### Minor Changes

- Features

  1. Add `layer:getInfoBySelectionIndex` and `getLayerInfoBySelectionIndex()` so clients can resolve Photoshop selection indices directly while the generator handles background-layer index offsets.

  Fixes

  1. Pass explicit transform geometry into the Photoshop JSX layer transform path so requested bounds are applied consistently.
  2. Report the first plugin folder or reserved id owner when later plugin folders are skipped for duplicate ids.

  Documentation

  1. Document selection-index layer lookup and duplicate plugin id diagnostics in the English and Chinese public docs.

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
