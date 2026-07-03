# API Routes

Plugins can expose HTTP handlers with `@api`.

```ts
import { BasePlugin, api } from "@ps-generator-bridge/sdk/plugin";

export default class PaintPlugin extends BasePlugin {
  static id = "paint";

  @api("/status")
  status() {
    return { ok: true };
  }
}
```

The route is mounted under the plugin id:

```text
GET /paint/status
```

## HTTP Method

Use the object form to choose a method:

```ts
@api({ method: "POST", url: "/create" })
create(params: unknown) {
  return { ok: true };
}
```

## Route Collisions

Plugin ids reserve their first path segment. A module API route cannot use the same first segment as a loaded plugin id.

This keeps plugin HTTP routes under:

```text
/{pluginId}/...
```

and prevents global module routes from stealing plugin namespaces.
