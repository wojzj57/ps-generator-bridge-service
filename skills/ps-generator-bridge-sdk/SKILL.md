---
name: ps-generator-bridge-sdk
description: Work on the PS Generator Bridge SDK package. Use when editing packages/sdk, changing packages/sdk/src/protocol, adding WebSocket protocol methods or HTTP helpers, updating Connection/RawConnection/PsBridgeClient behavior, preserving browser-safe SDK root boundaries, or authoring external plugin devkit APIs under @ps-generator-bridge/sdk/plugin.
---

# PS Generator Bridge SDK

Use this skill for changes in `packages/sdk`.

## Core Rules

- Treat `packages/sdk/src/protocol/` as the protocol source of truth.
- Model built-in WebSocket capabilities in `ProtocolMethod` and `ProtocolMethods` before changing the generator server.
- Keep `@ps-generator-bridge/sdk` root browser-safe and Node-free. Do not import Node built-ins, Fastify, `ws`, generator-core, COS SDK classes, or generator implementation runtime into root runtime code.
- Keep plugin authoring runtime in `src/plugin`; re-export generator contracts type-only through `@ps-generator-bridge/sdk/plugin`.
- Preserve `Symbol.for("ps-generator-bridge.*")` brand keys. They are cross-bundle handshakes.

## Client Surface

- Prefer `Connection` for public user-facing work. It builds endpoint paths from a service base URL, manages reconnects, stable `clientId`, events, JSX, Photoshop proxy helpers, plugin discovery, plugin health, and built-in modules.
- Use `new Connection()` for root `/ws`; use `new Connection(pluginId, options?)` for `/ws/{pluginId}`. `options.url` is a service base URL, not the final WebSocket path.
- Use `RawConnection` for lower-level typed `invoke()` or custom endpoint work.
- Keep `PsBridgeClient` compatible, but do not extend it for new public surface unless maintaining old callers.
- Align every built-in convenience method with `ProtocolMethod` constants instead of string literals.
- For Node 18-21 examples, inject a `WebSocket` implementation. Do not auto-import `ws` from the SDK root.

## HTTP Helpers

- Keep HTTP helpers under `src/publicConnection/`; they use `fetch`, not WebSocket frames.
- Static helpers currently cover `Connection.status()`, `Connection.plugins()`, and `Connection.pluginHealth(id)`.
- Validate HTTP response shapes before returning public DTOs. Malformed JSON or malformed objects should fail loudly.
- Build URLs through `buildHttpEndpoint()` so `ws/wss` base URLs convert to `http/https`.

## Protocol Workflow

When adding a protocol method:

1. Add or update models/events in `packages/sdk/src/protocol/`.
2. Add a constant in `ProtocolMethod`.
3. Add params and result shapes in `ProtocolMethods`.
4. Export public DTO types from `src/index.ts`.
5. Add protocol, connection, or public connection tests under `packages/sdk/test`.
6. Implement the generator handler only after the SDK contract compiles.

Plugin-specific methods are open string names. Do not add them to `ProtocolMethods` unless they become built-in bridge capabilities.

## Plugin Devkit

- External plugin authors import `BasePlugin`, `ws`, `api`, `bootstrap`, `useLogger`, and types from `@ps-generator-bridge/sdk/plugin`.
- Keep `BasePlugin` construction and decorator metadata compatible with bundled and duplicated SDK copies.
- Do not expose generator concrete classes through the plugin subpath. Authors should see `PluginHost`, module APIs, JSX APIs, event APIs, and optional `CosServiceApi` as interfaces/types.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/sdk typecheck
pnpm --filter @ps-generator-bridge/sdk test
```

SDK tests should use `FakeTransport`, injected `fetch`, or injected transports. They must not require Photoshop or a real generator server unless the test explicitly starts an in-process server owned by another package.
