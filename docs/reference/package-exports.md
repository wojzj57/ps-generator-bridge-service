# Package Exports

## `@ps-generator-bridge/sdk`

Root export:

```ts
import {
  Connection,
  RawConnection,
  ProtocolMethod,
  openPhotoshopOnLightBox,
} from "@ps-generator-bridge/sdk";
```

Important exports:

- `Connection`
- `RawConnection`
- `DEFAULT_CONNECTION_URL`
- `openPhotoshopOnLightBox`
- `createWebSocketTransport`
- `PsBridgeError`
- `ConnectionInterruptedError`
- `SessionCloseCode`
- protocol constants and types
- Photoshop event and module result types

Plugin authoring subpath:

```ts
import {
  BasePlugin,
  definePlugin,
  ws,
  api,
  bootstrap,
  type PluginInitContext,
  type PluginInitializer,
  type PluginRuntime,
} from "@ps-generator-bridge/sdk/plugin";
```

The plugin subpath exports the synchronous initializer contract, structural
runtime types, decorator authoring primitives, and type-only host/module/event
contracts. This includes `PluginInitContext`, `PluginInitializer`,
`PluginRuntime`, `WsSession`, `WsEndpoint`, and `WsHandlerContext`.

## `@ps-generator-bridge/generator`

The generator package is loaded by `generator-core` through `main.js`.

Exports:

- `init(generator, config?)`
- `PsBridgeHost`
- `PluginConfig`
- `PsGenerator`
- `JsxRunner`

Contract subpath:

```ts
import type { PluginEvents, JsxRunnerApi } from "@ps-generator-bridge/generator/contract";
```

The SDK plugin subpath re-exports these types for plugin authors.

## `@ps-generator-bridge/cli`

CLI binary:

```bash
ps-generator-bridge
```

Use it for command-line tooling, including Windows Photoshop + `generator-core` smoke checks. The package does not expose a public import API.
