# Plugin Events

Plugins use `this.events` to listen to Photoshop, main, and plugin-local events. They publish client-visible plugin-local events with `this.events.emit(...)`.

## Listen to Events

```ts
this.events.on("imageChanged", (event) => {
  console.log(event.id);
});

this.events.on("#ready", (event) => {
  console.log(event.port, event.plugins);
});

this.events.on("paint:changed", (event) => {
  console.log(event);
});
```

## Publish Plugin-Local Events

```ts
this.events.emit("paint:changed", {
  layerId: 7,
});
```

Only clients connected to this plugin's endpoint can subscribe to that plugin-local event name.

## Client Subscription

```ts
const paint = new Connection("paint");

paint.on("paint:changed", (event) => {
  console.log(event);
});
```

The SDK sends `event:subscribe` when the first listener is added. The generator delivers the event only to subscribed logical clients.

## Removed Direct Push APIs

Plugins should not use direct `broadcast` or `send` methods. Client-visible events flow through the plugin event facade and require remote clients to subscribe through the protocol.
