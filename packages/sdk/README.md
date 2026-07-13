# `@ps-generator-bridge/sdk`

Isomorphic TypeScript SDK for PS Generator Bridge. This package is browser-safe, works in Node >=18, and owns the protocol contract shared with the generator server.

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/sdk/connection
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/sdk/connection

Full public documentation lives in the repository docs:

- [Connection](../../docs/sdk/connection.md)
- [Events](../../docs/sdk/events.md)
- [Modules](../../docs/sdk/modules.md)
- [Protocol Reference](../../docs/reference/protocol.md)

## Install

```bash
npm install @ps-generator-bridge/sdk
```

In this monorepo, use:

```bash
pnpm --filter @ps-generator-bridge/sdk build
pnpm --filter @ps-generator-bridge/sdk test
```

## Quick Start

```ts
import { Connection } from "@ps-generator-bridge/sdk";

const connection = new Connection({
  url: "ws://127.0.0.1:7700",
});

await connection.ready();
const info = await connection.getServerInfo();
const document = await connection.modules.document.getCurrentDocument();

connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});

connection.close();
```

Use static HTTP helpers for service-level discovery:

```ts
const status = await Connection.status();
const plugins = await Connection.plugins();
const paintHealth = await Connection.pluginHealth("paint");
```

Open the LightBox Photoshop entry page only when the bridge server is not healthy:

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

Create plugin endpoint connections by plugin id when you need plugin-private methods or events:

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});

await paint.invoke("paint:createSession", { documentId: 1 });
```

`Connection.on()`, `Connection.once()`, and `Connection.off()` mirror listeners to
remote `event:subscribe` / `event:unsubscribe` requests. Root connections may
subscribe to Photoshop events and main `#` events. Plugin endpoint connections
may also subscribe to events emitted by that plugin.

If the Node runtime does not provide a global `WebSocket` (for example,
Node 18), inject one:

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  url: "ws://127.0.0.1:7700",
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## Public Surface

- `Connection` is the current public client facade. It manages reconnects, stable `clientId`, request correlation, events, JSX execution, and built-in modules.
- `new Connection()` connects to the default root service URL, `new Connection(options)` accepts a root service URL, `new Connection(pluginId)` connects to a plugin endpoint, and `new Connection(pluginId, options)` combines both.
- `connection.endpoint` reports whether the connection targets the root endpoint or a plugin endpoint.
- `connection.clientId` exposes the server-assigned client id after the handshake.
- `Connection.status()` queries `/health`; `Connection.plugins()` queries `/plugins`; `Connection.pluginHealth(id)` queries `/plugins/{id}/health`.
- `openPhotoshopOnLightBox()` checks `/health` and opens the LightBox Photoshop entry page only when the bridge server is not healthy.
- `connection.on()`, `connection.once()`, and `connection.off()` subscribe and unsubscribe server events through the protocol.
- Plugin-private APIs stay on the plugin endpoint connection through `connection.invoke(...)`.
- `connection.jsx` executes remote protocol-exposed JSX methods. Plugin authors should continue to use plugin-scoped helpers from their `BasePlugin` context.
- `RawConnection` exposes lower-level typed `invoke()` and event subscription.
- `PsBridgeClient` is retained for compatibility and is deprecated in favor of `Connection`.
- `createWebSocketTransport` and `Transport` are the injected transport seam used by tests and custom runtimes.
- `@ps-generator-bridge/sdk/plugin` exports plugin authoring primitives (`BasePlugin`, `ws`, `api`, `bootstrap`) and type-only host contracts.

Breaking changes from the old facade:

- `options.url` is now the service base URL, for example `ws://127.0.0.1:7700`; the SDK appends `/ws` or `/ws/{pluginId}`.
- `connection.id` was removed. Use `connection.clientId`.
- `connection.plugin` was removed. Use `Connection.plugins()` for discovery and `new Connection(pluginId)` for plugin endpoint calls.

## Protocol Contract

`src/protocol/` is the source of truth for:

- method names in `ProtocolMethod`
- request and response shapes in `ProtocolMethods`
- server push events in `ProtocolEvents`
- wire envelope helpers such as `parseFrame`, `serializeFrame`, `isRequest`, `isResponse`, and `isEvent`

When adding a server capability:

1. Add or update the method in `ProtocolMethod` and `ProtocolMethods`.
2. Add tests for serialization, typing, and client behavior.
3. Implement the server handler in `@ps-generator-bridge/generator`.
4. Add a convenience method to `Connection` only when it is part of the public SDK surface.

## Built-in Modules

`Connection.modules` currently exposes:

- `document.getCurrentDocument()`
- `document.exportDocument(params)`
- `document.saveDocument(params)`
- `layer.getLayerInfo(params?)`
- `layer.getLayerInfoByID(layerID, options?)`
- `layer.getLayerInfoByIndex(layerIndex, options?)`
- `action.autoCutout()`
- `action.removeBackground()`
- `image.exportLayer(params)`
- `image.getPreview(params)`
- `image.exportDocument(params)`

## Plugin Development

Use the plugin subpath for external plugin packages:

```ts
import { BasePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

export default class MyPlugin extends BasePlugin {
  static id = "myPlugin";

  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }

  changed(data: unknown) {
    this.events.emit("myPlugin:changed", data);
  }
}
```

Plugins publish client-visible events with `this.events.emit(...)`. Direct
`broadcast` / `send` APIs are not part of the plugin authoring surface.

The SDK plugin subpath must stay lightweight and platform-neutral. Do not import Fastify, `ws`, Photoshop Generator internals, COS SDK types, or other Node-only implementation details into the package root.

## Testing

```bash
pnpm --filter @ps-generator-bridge/sdk typecheck
pnpm --filter @ps-generator-bridge/sdk test
```

SDK tests use `FakeTransport` and do not require Photoshop.
