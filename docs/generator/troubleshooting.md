# Troubleshooting

## Cannot Connect

Check the health endpoint:

```bash
curl http://127.0.0.1:7700/health
```

If it does not return `{ "status": "ok" }`, verify that the generator package was loaded and that `PS_BRIDGE_PORT` or `PluginConfig.port` is not pointing clients at the wrong port.

## Missing WebSocket in Node

Node 18-21 do not provide a global `WebSocket`. Inject one:

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## Plugin Not Found

Plugin endpoint connections use `/ws/{pluginId}`. If the plugin id is unknown, the server sends a `PLUGIN_NOT_FOUND` error frame and closes the socket.

Check discovery:

```ts
const plugins = await Connection.plugins();
console.log(plugins);
```

## Plugin Event Not Delivered

Check these conditions:

- the client connects with `new Connection(pluginId)`
- the client registers `on(type, listener)` before expecting the event
- the plugin publishes with `this.events.emit(type, payload)`
- root endpoint clients are not used for plugin-local event names

## JSX Is Not Available

`jsx:run` and `jsx:execute` require the server to be created with a JSX runner. Real generator startup does this through `PsBridgeHost`. Some lower-level server tests or custom embeddings may omit JSX.

## COS Upload Not Used

COS is enabled only when all required fields are present:

- `PS_BRIDGE_COS_SECRET_ID`
- `PS_BRIDGE_COS_SECRET_KEY`
- `PS_BRIDGE_COS_BUCKET`
- `PS_BRIDGE_COS_REGION`

If any are missing or blank, image exports fall back to inline data URLs.
