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

The server assigns `clientId` in the first `connected` event. Clients cannot choose this id. During reconnect, the SDK sends the last server-issued id through `?resume=` so the server can restore the logical session. Unknown, expired, or malformed resume ids simply create a new session.

If your host needs to preserve identity across process or plugin restarts, store `connection.clientId` after `ready()` and pass it back explicitly:

```ts
const connection = new Connection("paint", { resume: storedClientId });
await connection.ready();
saveClientId(connection.clientId);
```

The SDK does not choose a persistence mechanism.

`connection.id` is not part of the public `Connection` API.

## Readiness

```ts
await connection.ready();
```

`ready()` resolves after the `connected` handshake. Calls to `invoke()` wait for readiness and queue across transient reconnects.

Use `reconnect()` to replace the current socket without disposing its logical session:

```ts
await connection.reconnect();
```

Requests already written before an interruption reject with `ConnectionInterruptedError`; they are not replayed because the server operation may already have completed. Calls started while reconnecting wait for the next handshake. Active event subscriptions are replayed after reconnect.

## Closing

```ts
connection.close();
```

`close()` is terminal. It stops reconnecting, rejects in-flight work, and tells the server to dispose the session immediately. A closed `Connection` cannot be reconnected.

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
connection.reconnect();
connection.close();
```

Plugin discovery is static:

```ts
const plugins = await Connection.plugins();
const paintHealth = await Connection.pluginHealth("paint");
```

`Connection.pluginHealth(id)` queries `GET /plugins/{id}/health`. It returns
loaded plugin client counts and load-time diagnostics for failed plugins.

LightBox Photoshop startup is exposed as a standalone helper, not a `Connection`
method:

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

It checks `Connection.status()` first and opens the LightBox entry page in a new
browser page only when the status result is `ok: false`.
