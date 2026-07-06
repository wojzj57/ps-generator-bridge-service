# Logger 规范

Logger 只从 `@ps-generator-bridge/sdk/plugin` 使用。模块内统一顶层创建 `log`：

```ts
import { useLogger } from "@ps-generator-bridge/sdk/plugin";

const log = useLogger("selection");

log.warn("selection event registration failed", error);
```

不要混用 `logger`、`console.*`、`this.plugin.logger`。

logger name 使用短小稳定的领域名，例如 `selection`、`image`、`plugin-loader`。
