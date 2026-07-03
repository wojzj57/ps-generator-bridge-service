# Plugin Authoring

External plugins use `@ps-generator-bridge/sdk/plugin`.

```ts
import { BasePlugin, ws, api } from "@ps-generator-bridge/sdk/plugin";

export default class MyPlugin extends BasePlugin {
  static id = "myPlugin";

  @ws("myPlugin:ping")
  ping() {
    return { ok: true };
  }

  @api("/status")
  status() {
    return { ok: true };
  }
}
```

## Package Shape

The generator loads plugin packages from direct children of the plugin directory. Each plugin package needs:

- a `package.json`
- a `main` entry
- a default export class derived from `BasePlugin`
- a static `id`

Plugin ids are route and endpoint identities. They must be unique among loaded plugins.

## Decorators

`@ws(name)` registers a WebSocket protocol method in the plugin-scoped registry:

```ts
@ws("paint:createSession")
createSession(params: { documentId: number }) {
  return { id: "session-1" };
}
```

Plugin endpoint dispatch is scoped-first, then global fallback. A plugin connection can call plugin methods and built-in module methods.

`@api(url)` registers an HTTP route under `/{pluginId}`:

```ts
@api("/status")
status() {
  return { ok: true };
}
```

## Host Capabilities

Inside `BasePlugin`, use protected shortcuts:

```ts
this.modules;
this.events;
this.jsx;
this.photoshop;
```

The host contract also exposes optional `cos` through the protected `plugin` field:

```ts
if (this.plugin.cos) {
  const url = await this.plugin.cos.uploadObject(bytes, "preview");
}
```

## Lifecycle

```ts
onConnect(clientId: string): void {}
onDisconnect(clientId: string): void {}
onDispose?(): void | Promise<void>;
```

`onConnect` runs after a client handshakes with the plugin endpoint. `onDisconnect` runs after that client socket is removed. `onDispose` runs during host shutdown before event resources are disposed.
