# Connection

`Connection` is the high-level SDK facade. It manages WebSocket connection state, reconnects, request correlation, event subscription, JSX, Photoshop proxy helpers, and built-in modules.

## Constructors

```ts
new Connection();
new Connection(options);
new Connection(pluginId, options?);
```

`options.url` is the service base URL, not the final WebSocket path.

| Input                                                   | WebSocket endpoint             |
| ------------------------------------------------------- | ------------------------------ |
| `new Connection()`                                      | `ws://127.0.0.1:7700/ws`       |
| `new Connection({ url: "ws://host:7700" })`             | `ws://host:7700/ws`            |
| `new Connection("paint")`                               | `ws://127.0.0.1:7700/ws/paint` |
| `new Connection("paint", { url: "https://host:7700" })` | `wss://host:7700/ws/paint`     |

## Endpoint Metadata

Every connection exposes immutable endpoint metadata:

```ts
connection.endpoint;
```

Root connection:

```ts
{
  kind: "root";
}
```

Plugin endpoint connection:

```ts
{ kind: "plugin", pluginId: "paint" }
```

## Client Identity

After the server handshake:

```ts
connection.clientId;
```

The server assigns `clientId` in the first `connected` event. During reconnect, the SDK reuses that id through `?id=` so the server can treat the new socket as the same logical client.

`connection.id` is not part of the public `Connection` API.

## Readiness

```ts
await connection.ready();
```

`ready()` resolves after the `connected` handshake. Calls to `invoke()` wait for readiness and queue across transient reconnects.

## Closing

```ts
connection.close();
```

`close()` stops reconnecting and rejects in-flight work.

## Public Surfaces

```ts
connection.invoke(method, params);
connection.modules;
connection.jsx;
connection.photoshop;
connection.on(type, listener);
connection.once(type, listener);
connection.off(type, listener);
connection.getServerInfo();
connection.ready();
connection.close();
```

Plugin discovery is static:

```ts
const plugins = await Connection.plugins();
```

LightBox Photoshop startup is exposed as a standalone helper, not a `Connection`
method:

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

It checks `Connection.status()` first and opens the LightBox entry page in a new
browser page only when the status result is `ok: false`.
