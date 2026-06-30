# `@ps-generator-bridge/sdk`

Isomorphic TypeScript SDK for PS Generator Bridge. This package is browser-safe, works in Node >=18, and owns the protocol contract shared with the generator server.

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
  url: "ws://127.0.0.1:7700/ws",
});

await connection.ready();
const info = await connection.getServerInfo();
const document = await connection.modules.document.getCurrentDocument();

connection.event.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});

connection.close();
```

Node 18-21 do not provide a global `WebSocket`. Inject one when needed:

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  url: "ws://127.0.0.1:7700/ws",
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## Public Surface

- `Connection` is the current public client facade. It manages reconnects, stable `clientId`, request correlation, events, JSX execution, plugin discovery, and built-in modules.
- `RawConnection` exposes lower-level typed `invoke()` and event subscription.
- `PsBridgeClient` is retained for compatibility and is deprecated in favor of `Connection`.
- `createWebSocketTransport` and `Transport` are the injected transport seam used by tests and custom runtimes.
- `@ps-generator-bridge/sdk/plugin` exports plugin authoring primitives (`BasePlugin`, `ws`, `api`, `bootstrap`) and type-only host contracts.

## Protocol Contract

`src/protocol.ts` is the source of truth for:

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

Image export methods are defined in the protocol and are available through `RawConnection.invoke()` until a public facade is added.

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
}
```

The SDK plugin subpath must stay lightweight and platform-neutral. Do not import Fastify, `ws`, Photoshop Generator internals, COS SDK types, or other Node-only implementation details into the package root.

## Testing

```bash
pnpm --filter @ps-generator-bridge/sdk typecheck
pnpm --filter @ps-generator-bridge/sdk test
```

SDK tests use `FakeTransport` and do not require Photoshop.
