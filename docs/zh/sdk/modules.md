# 模块

`connection.modules` 暴露内置 generator 能力的类型化 wrapper。

## Document

```ts
const document = await connection.modules.document.getCurrentDocument();

await connection.modules.document.exportDocument({
  filePath: "C:/tmp/out.psd",
});

await connection.modules.document.saveDocument({
  savePath: "C:/tmp/design.psd",
});
```

## Layer

```ts
const layer = await connection.modules.layer.getLayerInfo({ id: 7 });

const byId = await connection.modules.layer.getLayerInfoByID(7, {
  getChildren: true,
});

const byIndex = await connection.modules.layer.getLayerInfoByIndex(1, {
  getChildren: false,
});

const preview = await connection.modules.layer.getCurrentPreview();

const imported = await connection.modules.layer.importImage({
  image: "data:image/png;base64,...",
  name: "Placed artwork",
  position: { x: 120, y: 80 },
  size: { width: 512, height: 512 },
});
```

`importImage()` 接收 data URI、原始 base64 图片数据、HTTP(S) URL、`file://` URI 或本地文件路径。generator 会在导入 Photoshop 前把来源校验为图片。默认接受 `png`、`jpeg`、`webp`、`gif` 和 `tiff`，允许本地路径，解码后/导入字节数上限为 100 MB，尺寸上限为 100,000,000 总像素。可选放置字段可以设置图层名称、位置、尺寸、当前 work path mask，或相对目标图层插入。

## Action

```ts
const cutout = await connection.modules.action.autoCutout();

const removed = await connection.modules.action.removeBackground();
```

## Image

```ts
const layerImage = await connection.modules.image.exportLayer({
  documentId: 1,
  layerSpec: 7,
  settings: { scaleX: 0.5 },
});

const layerWithPath = await connection.modules.image.exportLayerWithSelectedPath({
  documentId: 1,
  layerSpec: 7,
  expand: 4,
});

const preview = await connection.modules.image.getPreview({
  layerSpec: 7,
});

const documentImage = await connection.modules.image.exportDocument({
  documentId: 1,
  settings: { scaleY: 0.25 },
});
```

Image 方法返回 `WsImageResult`：

```ts
{
  data: "data:image/png;base64,...",
  bounds: { left: 0, top: 0, right: 100, bottom: 100 },
  width: 100,
  height: 100
}
```

当 generator 配置了 COS 上传时，`data` 也可以是 HTTPS URL，而不是内联 data URL。

`image.getPreview()` 和 `layer.getCurrentPreview()` 会按长边缩放，让预览长边接近 300 px；更小的图层保持原尺寸。

`exportLayerWithSelectedPath()` 会把当前选择路径合成到导出的 layer 图片上。如果没有选择路径，它返回普通 layer 导出结果。

## Selection

```ts
await connection.modules.selection.watch();

const area = await connection.modules.selection.getArea();

const path = await connection.modules.selection.getPath({
  expand: 4,
});
```

`getArea()` 返回当前矩形选区 bounds 或 `null`。`getPath()` 返回当前选择路径的 SVG path 元数据或 `null`。

## 自定义和插件方法

内置 wrapper 没覆盖的方法、自定义插件方法、插件专属 typed wrapper，都可以用 `invoke()`：

```ts
const paint = new Connection("paint");

const session = await paint.invoke<{ id: string }>("paint:createSession", {
  documentId: 1,
});
```
