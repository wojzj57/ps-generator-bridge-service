---
name: ps-generator-bridge-generator
description: Work on the PS Generator Bridge generator package. Use when editing packages/generator, changing the Photoshop Generator host, Fastify HTTP/WebSocket server, Registry or ScopedRegistry dispatch, plugin loading and plugin health, built-in modules, JSX runner, COS integration, or the type-only contract surface consumed by @ps-generator-bridge/sdk/plugin.
---

# PS Generator Bridge Generator

Use this skill for changes in `packages/generator`.

## Runtime Model

- `main.js` is the CommonJS boundary loaded by Adobe `generator-core`.
- `src/index.ts` exports `init(generator, config)` and composes `PsBridgeHost`.
- `PsBridgeHost` owns the injected `PsGenerator`, built-in modules, `JsxRunner`, `EventManager`, optional `CosService`, plugin loading, and server startup.
- `createServer` builds Fastify routes before `listen()`. All HTTP routes must be registered before listening.
- Default service host/port is `127.0.0.1:7700`.
- Root WebSocket endpoint is `/ws`; plugin WebSocket endpoints are `/ws/{pluginId}`.
- HTTP endpoints include `GET /health`, `GET /plugins`, and `GET /plugins/{id}/health`.

## Boundary Rules

- Keep the SDK as the protocol source of truth. Import SDK protocol values/types instead of duplicating method strings.
- `packages/generator/src/contract.ts` is the narrow type-only surface exposed to SDK plugin authors. Keep server internals out of it.
- Do not leak Fastify, `ws`, generator-core, `sharp`, COS SDK concrete types, or other implementation details into SDK-facing contracts.
- All Photoshop interaction should pass through the injected `PsGenerator` or `JsxRunner`; avoid scattering direct `evaluateJSXFile` calls.
- Keep JSX files as plain resources under `jsx/`; they are not bundled by tsup.
- Use `useLogger()` from `@ps-generator-bridge/sdk/plugin`; keep logger names short and stable.

## Implementation Workflow

When adding a capability:

1. Update `packages/sdk/src/protocol/` first if the capability is public over WebSocket.
2. Add or update module code under `src/modules` or built-ins under `src/server/builtins.ts`.
3. Register methods with decorators or the registry using `ProtocolMethod` constants.
4. For HTTP capability, register routes before `listen()` and document the endpoint in protocol/reference docs.
5. Add unit tests with `FakeGenerator`, injected seams, or local ephemeral WebSocket servers.
6. Update README, public docs, and `TESTING.md` if public behavior or test scope changes.

## Plugin Loading

- External plugins are direct children of `pluginsDir`.
- Each plugin package needs a `package.json` with `main` and a default `BasePlugin` subclass.
- Plugin classes declare a static `id` matching `[A-Za-z0-9_-]+`; ids must be unique.
- Load failures are recorded so `GET /plugins/{id}/health` can report failed plugin diagnostics.
- Register plugins before module bootstrap so plugin ids reserve first HTTP path segments and module routes cannot steal plugin namespaces.
- Plugin `@api` routes mount under `/{pluginId}/{path}`.
- Plugin WebSocket dispatch is scoped-first through `ScopedRegistry`, then global fallback through `Registry`.

## Config And Env

- Structured runtime options live in `PluginConfig`: `port`, `pluginsDir`, and layer import validation options.
- Env overrides use `PS_BRIDGE_*`; secrets and deployment knobs stay out of structured config when possible.
- COS is enabled only when required `PS_BRIDGE_COS_*` fields are present. Plugin-facing code should see only `CosServiceApi`.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/generator typecheck
pnpm --filter @ps-generator-bridge/generator test
```

Unit tests should not require real Photoshop. Use real Photoshop only through manual launch configs or the CLI smoke harness.
