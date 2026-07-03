# 插件 JSX

插件获得的 JSX runner 会被限定到自己的插件目录。

```ts
const result = await this.jsx.execute("createLayer", {
  name: "Generated",
});
```

这会解析到：

```text
<pluginDir>/jsx/createLayer.jsx
```

## 内置 JSX

插件也可以通过同一个 runner 调用内置 JSX 资源：

```ts
const info = await this.jsx.executeBuiltin("Document/getDocumentInfo", {
  id: 1,
});
```

## 原始脚本

没有封装成 JSX 文件时，可以用 `run()` 执行内联 ExtendScript：

```ts
const name = await this.jsx.run<string>("app.activeDocument.name");
```

## 插件 JSX 与远程 JSX

插件 `this.jsx` 属于插件 authoring 上下文，并且有插件作用域。远程 SDK 的 `connection.jsx` 是通过 WebSocket 暴露的协议级 JSX 方法。

写插件时使用 `this.jsx`。写远程客户端时使用 `connection.jsx`。
