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
- 协议常量和类型
- Photoshop 事件和模块结果类型

插件开发子路径：

```ts
import { BasePlugin, ws, api, bootstrap } from "@ps-generator-bridge/sdk/plugin";
```

插件子路径导出运行时 authoring 原语，以及 type-only 的 host、module、event 契约。

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

## `@ps-generator-bridge/testkit`

CLI binary：

```bash
ps-bridge-test
```

用于 Windows Photoshop + `generator-core` 冒烟检查。
