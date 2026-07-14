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

Callers may provide a stable identity when constructing either a root or plugin
connection:

```ts
const root = new Connection({ clientId: "lightbox-editor" });
const paint = new Connection("paint", { clientId: "lightbox-editor" });
```

After the server handshake:

```ts
connection.clientId;
```

When no id is supplied, the server assigns one in the first `connected` event.
During reconnect, the SDK sends the current id through `?clientId=` so the server
can treat the new socket as the same logical client. The legacy `?id=` spelling
is still accepted by the server.

Client ids contain 1-128 letters, numbers, or `.`, `:`, `-`, `_` characters.
They are scoped per endpoint: the same id may be connected to root and multiple
plugin endpoints at once. Within one endpoint, a new socket with the same id
takes over the old socket and preserves its event subscriptions. A client id is
an identity label, not an authentication credential.

`connection.id` is not part of the public `Connection` API.

## Readiness

```ts
await connection.ready();
```

`ready()` resolves after the `connected` handshake. Calls to `invoke()` wait for readiness and queue across transient reconnects.

## Manual Reconnect

```ts
await connection.reconnect();
```

`reconnect()` immediately replaces a ready socket, reuses the current
`clientId`, waits for the new handshake, and restores event subscriptions. Calls
made while a connection attempt is already running join that attempt. A manual
call can recover a connection after automatic retries are exhausted, but cannot
reopen an instance after `close()`.

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
