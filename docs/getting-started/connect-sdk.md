# Connect SDK

Use `Connection` from `@ps-generator-bridge/sdk` for the public client facade.

## Root Connection

```ts
import { Connection } from "@ps-generator-bridge/sdk";

const connection = new Connection();

await connection.ready();

const info = await connection.getServerInfo();
const document = await connection.modules.document.getCurrentDocument();

connection.on("imageChanged", (event) => {
  console.log(event.id, event.layers);
});

connection.close();
```

`new Connection()` uses the default service base URL `ws://127.0.0.1:7700` and connects to `/ws`.

## Custom Service URL

`options.url` is a service base URL. The SDK appends the WebSocket path.

```ts
const connection = new Connection({
  url: "http://127.0.0.1:7700",
});
```

HTTP base URLs become WebSocket URLs for instance connections:

- `http:` -> `ws:`
- `https:` -> `wss:`

## Plugin Endpoint Connection

Use a plugin id when calling plugin-private methods or listening to plugin-local events:

```ts
const paint = new Connection("paint");

await paint.ready();

paint.on("paint:changed", (event) => {
  console.log(event);
});

await paint.invoke("paint:createSession", { documentId: 1 });
```

## Service Helpers

Service-level status and plugin discovery use HTTP:

```ts
const status = await Connection.status();
const plugins = await Connection.plugins();
```

`Connection.status()` returns `{ ok: true, status: "ok" }` or `{ ok: false, error }`. `Connection.plugins()` returns `PluginInfo[]` and throws an ordinary `Error` on HTTP, fetch, or response-shape failures.

Open the LightBox Photoshop entry page only when the local bridge server is not healthy:

```ts
import { openPhotoshopOnLightBox } from "@ps-generator-bridge/sdk";

await openPhotoshopOnLightBox();
```

`openPhotoshopOnLightBox()` calls `Connection.status()` first. If the bridge is already healthy, it does nothing; otherwise it opens the LightBox Photoshop entry page in a new browser page.
