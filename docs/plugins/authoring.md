# Plugin Authoring

External plugins use `@ps-generator-bridge/sdk/plugin`. A package exports a
synchronous initializer; the initializer may return either a plain runtime
object or an instance derived from `BasePlugin`.

```ts
import { BasePlugin, definePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

class MyPlugin extends BasePlugin {
  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }

  @api("/status")
  status() {
    return { ok: true };
  }
}

export default definePlugin("myPlugin", (context) => new MyPlugin(context));
```

## Package Shape

The generator scans the configured plugin sources for packages. Each package
needs:

- a `package.json`
- a `main` entry
- a default-exported synchronous initializer
- a plugin id resolved before the initializer runs

Declare the id with the top-level `pluginId` field in `package.json`:

```json
{
  "name": "@acme/my-plugin",
  "pluginId": "myPlugin",
  "main": "dist/index.js"
}
```

Alternatively, attach the id in code with `definePlugin(id, init)`. Identity is
resolved in this order:

1. `package.json.pluginId`
2. the initializer id attached by `definePlugin`
3. `package.json.name`

If the manifest and initializer both declare different ids, loading fails. A
package-name fallback must already match `[A-Za-z0-9_-]+`, so scoped names such
as `@acme/my-plugin` need an explicit `pluginId`. A returned runtime may expose
`pluginId`, but when present it must match the resolved id.

Plugin ids are route and endpoint identities. The host loads explicit paths
from `PS_BRIDGE_PLUGINS`, then `PluginConfig.plugins`, then the sorted children
of the collection directory. The first candidate that completes initialization
and activation claims an id. A failed candidate does not prevent a later
candidate from trying the same id; candidates after a successful owner are
skipped.

## Initializer Context

`PluginInitContext` is frozen and owned by the host:

```ts
interface PluginInitContext {
  readonly pluginId: string;
  readonly host: PluginHost;
  ws(name: string, handler: MethodHandler): void;
  api(url: string, handler: ApiHandler): void;
  api(route: { method?: HttpMethod | HttpMethod[]; url: string }, handler: ApiHandler): void;
}
```

A plain-object plugin can register handlers directly:

```ts
import type { PluginInitializer } from "@ps-generator-bridge/sdk/plugin";

const init: PluginInitializer = (context) => {
  context.ws("paint:ping", (params) => ({ params }));
  context.api("/status", () => ({ ok: true }));
  context.api({ method: "POST", url: "/paint" }, () => ({ created: true }));

  return {
    pluginId: context.pluginId,
    onConnect(clientId) {},
    onDisconnect(clientId) {},
    async onDispose() {},
  };
};

export default init;
```

`context.ws()` and `context.api()` accept registrations only while the
initializer is running. Returning a Promise is an error; keep initialization
strictly synchronous. Keep package top-level code limited to imports and
declarations, and perform host-owned registration inside the initializer.

## Decorators

`BasePlugin` accepts the same `PluginInitContext` in its constructor and keeps
the decorator-based authoring shortcuts. `@ws(name)` registers a WebSocket
protocol method in the plugin-scoped registry:

```ts
@ws("paint:createSession")
createSession(params: { documentId: number }) {
  return { id: "session-1" };
}
```

Plugin endpoint dispatch is scoped-first, then global fallback. A plugin
connection can call plugin methods and built-in module methods.

`@api(url)` registers an HTTP route under `/{pluginId}`:

```ts
@api("/status")
status() {
  return { ok: true };
}
```

Direct and decorated registrations are staged together. Duplicate or malformed
registrations fail that plugin before its handlers become active.

## Host Capabilities

Inside `BasePlugin`, use protected shortcuts:

```ts
this.modules;
this.events;
this.jsx;
this.photoshop;
```

The host contract also exposes optional `cos` through the protected `plugin`
field:

```ts
if (this.plugin.cos) {
  const url = await this.plugin.cos.uploadObject(bytes, "preview");
}
```

Plain-object plugins reach the same narrow host contract through
`context.host`.

## Lifecycle

An `@ws` handler may accept a second, platform-neutral context argument:

```ts
import type { WsHandlerContext } from "@ps-generator-bridge/sdk/plugin";

@ws("paint:run")
run(params: unknown, context: WsHandlerContext): unknown {
  return { clientId: context.clientId, endpoint: context.session.endpoint };
}
```

`context.session` exposes only `clientId` and endpoint metadata. The raw socket
remains generator-internal.

```ts
onConnect?(clientId: string): void;
onDisconnect?(clientId: string): void;
onDispose?(): void | Promise<void>;
```

`onConnect` and `onDisconnect` must be synchronous. `onConnect` runs once for a
fresh logical session. An unexpected socket loss keeps the session resumable
for 30 minutes by default, so it does not run `onDisconnect`; a successful
resume also runs neither hook. `onDisconnect` runs after an explicit SDK
`close()` or resume TTL expiry. `onDispose` may be asynchronous and runs during
host shutdown before event resources are disposed.

Hook failures are contained inside the owning plugin and appear in plugin
health diagnostics instead of interrupting host startup, other clients, or
shutdown.
