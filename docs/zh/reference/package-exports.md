# 包导出

## `@ps-generator-bridge/sdk`

根导出：

```ts
import {
  Connection,
  RawConnection,
  ProtocolMethod,
  openPhotoshopOnLightBox,
} from "@ps-generator-bridge/sdk";
```

重要导出：

- `Connection`
- `RawConnection`
- `DEFAULT_CONNECTION_URL`
- `openPhotoshopOnLightBox`
- `createWebSocketTransport`
- `PsBridgeError`
- `ConnectionInterruptedError`
- `SessionCloseCode`
- 协议常量和类型
- Photoshop 事件和模块结果类型

插件开发子路径：

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

插件子路径导出同步 initializer 契约、结构化 runtime 类型、decorator authoring
原语，以及 type-only 的 host、module、event 契约。其中包括
`PluginInitContext`、`PluginInitializer`、`PluginRuntime`、`WsSession`、
`WsEndpoint` 和 `WsHandlerContext`。

## `@ps-generator-bridge/generator`

generator 包通过 `main.js` 被 `generator-core` 加载。

导出：

- `init(generator, config?)`
- `PsBridgeHost`
- `PluginConfig`
- `PsGenerator`
- `JsxRunner`

契约子路径：

```ts
import type { PluginEvents, JsxRunnerApi } from "@ps-generator-bridge/generator/contract";
```

SDK 插件子路径会为插件作者重新导出这些类型。

## `@ps-generator-bridge/cli`

CLI binary：

```bash
ps-generator-bridge
```

用于命令行工具，包括 Windows Photoshop + `generator-core` 冒烟检查。该包不暴露可 import 的公共 API。
