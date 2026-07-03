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
```

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

## Custom and Plugin Methods

Use `invoke()` for built-in methods without wrappers, custom plugin methods, or plugin-specific typed wrappers:

```ts
const paint = new Connection("paint");

const session = await paint.invoke<{ id: string }>("paint:createSession", {
  documentId: 1,
});
```
