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
- protocol constants and types
- Photoshop event and module result types

Plugin authoring subpath:

```ts
import { BasePlugin, ws, api, bootstrap } from "@ps-generator-bridge/sdk/plugin";
```

The plugin subpath exports runtime authoring primitives and type-only host/module/event contracts.

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

## `@ps-generator-bridge/testkit`

CLI binary:

```bash
ps-bridge-test
```

Use it for Windows Photoshop + `generator-core` smoke checks.
