# 内置能力矩阵

generator 会注册 `packages/generator/src/modules/index.ts` 中 `MODULES` manifest
声明的内置模块。`modules/` 下存在目录并不代表能力已经发布；只有进入该 manifest
的模块才属于当前公开能力。

下表记录每项逻辑能力是否具有正式访问面：

- **SDK** 表示存在类型化的 `Connection.modules.*` facade；通用
  `Connection.invoke(...)` 不计入支持。
- **Plugin Host** 表示能力属于面向插件作者导出的类型化
  `plugin.modules.*` 契约。
- **WS** 表示能力注册为 WebSocket Protocol 方法。
- **HTTP API** 表示能力具有已注册的 `@api` 路由。
- **MCP** 在当前版本中尚未实现，因此所有内置能力都不支持 MCP。

勾表示该访问面提供了能力入口。不同访问面的参数和结果形状可能不同；具体契约请参阅
[SDK 模块](../sdk/modules.md)、[协议](./protocol.md)和
[API 路由](../plugins/api-routes.md)。

## 请求能力

| 能力                                 | 简要说明                              | SDK | Plugin Host | WS  | HTTP API | MCP |
| ------------------------------------ | ------------------------------------- | :-: | :---------: | :-: | :------: | :-: |
| `action.autoCutout`                  | 选中当前图层的主要主体。              | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `action.removeBackground`            | 移除当前图层的背景。                  | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.getCurrentDocument`        | 读取当前活动文档的元数据。            | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.exportDocument`            | 把当前活动文档导出到文件。            | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `document.saveDocument`              | 保存当前活动文档，可指定新路径。      | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfo`                 | 读取图层元数据，可包含子图层和设置。  | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoByID`             | 按 Photoshop 图层 ID 读取图层元数据。 | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoByIndex`          | 按文档图层索引读取图层元数据。        | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.getLayerInfoBySelectionIndex` | 按图层在当前选择中的索引读取元数据。  | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `layer.getCurrentPreview`            | 为当前图层渲染 PNG 预览。             | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `layer.importImage`                  | 把图片导入为图层，可指定位置和尺寸。  | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportLayer`                  | 把图层或图层范围导出为 PNG 图片数据。 | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportLayerWithSelectedPath`  | 使用当前选中路径导出图层。            | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.getPreview`                   | 为指定图层渲染 PNG 预览。             | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `image.exportDocument`               | 把文档导出为 PNG 图片数据。           | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `selection.watch`                    | 启用 selection change 事件生产。      | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `selection.getArea`                  | 读取当前选择区域的边界。              | ✅  |     ✅      | ✅  |    ✅    | ❌  |
| `selection.getPath`                  | 以 SVG 几何数据读取当前选择路径。     | ✅  |     ✅      | ✅  |    ✅    | ❌  |

## 事件能力

模块事件使用类型化的 SDK 和 Plugin Host 事件 facade。远程 SDK 订阅通过 WebSocket
传输；事件不提供 HTTP 或 MCP 入口。

| 事件                    | 简要说明                             | SDK | Plugin Host | WS  | HTTP API | MCP |
| ----------------------- | ------------------------------------ | :-: | :---------: | :-: | :------: | :-: |
| `layer:previewChange`   | 发布刷新后的当前图层预览。           | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `layer:selectionChange` | 发布 Photoshop 已选图层的元数据。    | ✅  |     ✅      | ✅  |    ❌    | ❌  |
| `selection:changed`     | 选择发生变化后发布当前选择区域边界。 | ✅  |     ✅      | ✅  |    ❌    | ❌  |
