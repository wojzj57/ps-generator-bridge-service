# Events

`Connection.on()`, `Connection.once()`, and `Connection.off()` register local listeners and mirror them to the server with `event:subscribe` and `event:unsubscribe`.

## Listener Behavior

The first listener for an event type sends a remote subscribe request:

```ts
connection.on("imageChanged", listener);
```

Adding another listener for the same event type does not send another subscribe request.

When the last listener for an event type is removed, the SDK sends `event:unsubscribe`:

```ts
connection.off("imageChanged", listener);
```

`once()` removes its wrapper after the first matching event and unsubscribes if no listeners remain.

## Reconnect Behavior

Active subscriptions replay after reconnect. If a subscription request was pending during a drop, the SDK resets pending state and sends the subscription again after the next handshake.

## Event Domains

Root endpoint connections may subscribe to:

- Photoshop events
- main events such as `#ready`, `#closing`, and built-in module events

Plugin endpoint connections may subscribe to:

- Photoshop events
- main events
- plugin-local event names emitted by that plugin

Root endpoint connections cannot subscribe to plugin-local event names. The server rejects those subscriptions with a protocol error.

## Photoshop Events

Typed Photoshop event names include:

- `workspaceChanged`
- `toolChanged`
- `quickMaskStateChanged`
- `documentChanged`
- `closedDocument`
- `newDocumentViewCreated`
- `activeViewChanged`
- `currentDocumentChanged`
- `backgroundColorChanged`
- `foregroundColorChanged`
- `imageChanged`

Example:

```ts
connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});
```

## Main Events

Main events are server-owned events exposed by the SDK protocol. They include host lifecycle events and built-in module events:

```ts
connection.on("#ready", (event) => {
  console.log(event.port, event.plugins);
});

connection.on("#closing", (event) => {
  console.log(event.reason);
});

connection.on("selection:changed", (area) => {
  console.log(area);
});

connection.on("layer:previewChange", (preview) => {
  console.log(preview?.id, preview?.width, preview?.height);
});

connection.on("layer:selectionChange", (layers) => {
  console.log(layers?.map((layer) => layer.id));
});
```

Built-in module event names include:

- `selection:changed`
- `layer:previewChange`
- `layer:selectionChange`

## Plugin Events

Plugin-local events are open string names. Connect to the plugin endpoint before subscribing:

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});
```

The plugin publishes the event with its plugin event facade:

```ts
this.events.emit("paint:changed", { layerId: 7 });
```
