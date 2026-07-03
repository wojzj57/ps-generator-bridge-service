# Plugin JSX

Plugins get a JSX runner scoped to their own plugin directory.

```ts
const result = await this.jsx.execute("createLayer", {
  name: "Generated",
});
```

This resolves:

```text
<pluginDir>/jsx/createLayer.jsx
```

## Built-in JSX

Plugins can call built-in JSX resources through the same runner:

```ts
const info = await this.jsx.executeBuiltin("Document/getDocumentInfo", {
  id: 1,
});
```

## Raw Scripts

Use `run()` for inline ExtendScript when no packaged JSX file exists:

```ts
const name = await this.jsx.run<string>("app.activeDocument.name");
```

## Plugin JSX vs Remote JSX

Plugin `this.jsx` is scoped to the plugin authoring context. Remote SDK `connection.jsx` exposes protocol-level JSX methods over WebSocket.

Use plugin `this.jsx` when writing a plugin. Use `connection.jsx` when writing a remote client.
