# @ps-generator-bridge/testkit

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

### Patch Changes

- Updated dependencies
  - @ps-generator-bridge/generator@0.2.0
  - @ps-generator-bridge/sdk@0.2.0

## 0.1.2

### Patch Changes

- Harden public Connection event handling for direct WebSocket access.
- Updated dependencies
  - @ps-generator-bridge/sdk@0.1.2
  - @ps-generator-bridge/generator@0.1.2

## 0.1.1

### Patch Changes

- Run the Photoshop process check without a shell wrapper.
  - @ps-generator-bridge/sdk@0.1.1
  - @ps-generator-bridge/generator@0.1.1
