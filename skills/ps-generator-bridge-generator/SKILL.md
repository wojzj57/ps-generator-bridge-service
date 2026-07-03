---
name: ps-generator-bridge-generator
description: Work on the PS Generator Bridge generator package. Use when editing packages/generator, changing the Photoshop Generator host, Fastify/WebSocket server, Registry, plugin loading, built-in modules, JSX runner, COS integration, or type-only contract surface consumed by @ps-generator-bridge/sdk/plugin.
---

# PS Generator Bridge Generator

Use this skill for changes in `packages/generator`.

## Runtime Model

- `main.js` is the CommonJS boundary loaded by Adobe `generator-core`.
- `src/index.ts` exports `init(generator, config)` and composes `PsBridgeHost`.
- `PsBridgeHost` owns the injected `PsGenerator`, built-in modules, `JsxRunner`, `EventManager`, optional `CosService`, plugin loading, and server startup.
- `createServer` builds Fastify routes before `listen()`. Register plugin routes and module routes before listening.
- Default public endpoint is `ws://127.0.0.1:7700/ws`; plugin scoped endpoints are `/ws/{pluginId}`.

## Boundary Rules

- Keep the SDK as the protocol source of truth. Import SDK protocol values/types instead of duplicating method strings.
- `packages/generator/src/contract.ts` is the narrow type-only surface exposed to SDK plugin authors. Keep server internals out of it.
- Do not leak Fastify, `ws`, generator-core, `sharp`, COS SDK concrete types, or other implementation details into SDK-facing contracts.
- All Photoshop interaction should pass through the injected `PsGenerator` or `JsxRunner`; avoid scattering direct `evaluateJSXFile` calls.
- Keep JSX files as plain resources under `jsx/`; they are not bundled by tsup.

## Implementation Workflow

When adding a capability:

1. Update `packages/sdk/src/protocol.ts` first if the capability is public over WebSocket.
2. Add or update module code under `src/modules` or built-ins under `src/server/builtins.ts`.
3. Register methods with decorators or the registry using `ProtocolMethod` constants.
4. Add unit tests with `FakeGenerator` or local ephemeral WebSocket servers.
5. Update README and TESTING docs if the public behavior or test scope changes.

## Plugin Loading

- External plugins are direct children of `pluginsDir`.
- Each plugin package needs a `package.json` with `main` and a default `BasePlugin` subclass.
- Plugin ids reserve path segments. Register plugins before module bootstrap so module HTTP routes cannot steal plugin namespaces.
- Plugin dispatch is scoped-first with global fallback.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/generator typecheck
pnpm --filter @ps-generator-bridge/generator test
```

Unit tests should not require real Photoshop. Use real Photoshop only through manual launch configs or the CLI smoke harness.
