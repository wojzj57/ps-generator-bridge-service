# @ps-generator-bridge/generator

## 1.2.1

### Patch Changes

- Fixes

  1. Use `PS_BRIDGE_COS_SECRET_ID` and `PS_BRIDGE_COS_SECRET_KEY` directly after trimming, removing deployment-specific marker and Base64 decoding behavior.

  Maintenance

  1. Exclude Generator source maps and the tsup metafile from published packages while retaining runtime JavaScript and TypeScript declarations.

## 1.2.0

### Minor Changes

- Fixes

  1. Decode complete `PS_BRIDGE_COS_SECRET_ID` and `PS_BRIDGE_COS_SECRET_KEY` values only when `REZ_LIGHTBOX_PS_SERVICE_BASE` is present, while preserving configured credentials in other environments without relying on a `base64:` prefix.

## 1.1.1

### Patch Changes

- Refactors

  1. Package the Generator runtime with bundled sharp JavaScript and a flat native addon directory, removing the nested vendor dependency tree and the Generator module-whitelist workaround while preserving standalone PNG encoding.

## 1.1.0

### Minor Changes

- Features

  1. Allow `PS_BRIDGE_COS_SECRET_ID` and `PS_BRIDGE_COS_SECRET_KEY` to use an explicit `base64:` prefix, decoding valid credentials before COS client creation while preserving unprefixed values.

  Fixes

  1. Resolve package-private runtime dependencies such as `sharp` when the Generator package is installed through a symlink by adding the real plugin directory to Adobe Generator's module whitelist before bundle loading.

## 1.0.0

### Major Changes

- Breaking Changes

  - External plugin packages must replace a default-exported `BasePlugin` class with a synchronous initializer; wrap existing classes with `definePlugin(id, (context) => new Plugin(context))`, register handlers during initialization, and keep `onConnect` and `onDisconnect` synchronous.
  - Published generator runtimes now target Windows x64 and carry their JavaScript dependencies plus a package-private sharp vendor payload instead of relying on an external dependency installation.

  Features

  1. Load synchronous class-based or plain-object plugin initializers with staged WebSocket and HTTP handler registration and deterministic plugin identity resolution.
  2. Add ordered explicit plugin sources through `PS_BRIDGE_PLUGINS` and `PluginConfig.plugins`, with absolute-path validation, real-path deduplication, and deterministic first-success plugin id ownership.
  3. Ship `@ps-generator-bridge/generator` as a standalone Windows x64 runtime with bundled JavaScript dependencies and a complete package-private sharp vendor payload.

  Fixes

  1. Contain third-party plugin registration and lifecycle failures within the owning plugin, preserve healthy plugins and sessions, and expose protocol-safe diagnostics through `/plugins/{id}/health` with `PLUGIN_REGISTRATION_FAILED` and `PLUGIN_LIFECYCLE_FAILED` errors.

  Documentation

  1. Document standalone runtime requirements, explicit plugin source precedence, synchronous plugin initialization, lifecycle constraints, and plugin health diagnostics in the public English and Chinese guides.

## 0.6.1

### Patch Changes

- Fixes

  1. Correct selection-driven layer lookup for documents with or without a background layer by mapping Generator selection indices to Photoshop Action Manager indices with the appropriate base.

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
