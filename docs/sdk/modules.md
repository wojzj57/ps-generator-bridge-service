# Modules

`connection.modules` exposes typed wrappers for built-in generator capabilities.

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

`importImage()` accepts a data URI, raw base64 image data, an HTTP(S) URL, a `file://` URI, or a local file path. Optional placement fields can name the layer, position it, resize it, apply the current work path as a mask, or insert relative to a target layer.

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

Image methods return `WsImageResult`:

```ts
{
  data: "data:image/png;base64,...",
  bounds: { left: 0, top: 0, right: 100, bottom: 100 },
  width: 100,
  height: 100
}
```

When COS upload is configured on the generator, `data` can be an HTTPS URL instead of an inline data URL.

`exportLayerWithSelectedPath()` composites the current selection path over the exported layer image. If there is no selection path, it returns the plain layer export.

## Selection

```ts
await connection.modules.selection.watch();

const area = await connection.modules.selection.getArea();

const path = await connection.modules.selection.getPath({
  expand: 4,
});
```

`getArea()` returns the current rectangular selection bounds or `null`. `getPath()` returns SVG path metadata for the current selection path or `null`.

## Custom and Plugin Methods

Use `invoke()` for built-in methods without wrappers, custom plugin methods, or plugin-specific typed wrappers:

```ts
const paint = new Connection("paint");

const session = await paint.invoke<{ id: string }>("paint:createSession", {
  documentId: 1,
});
```
