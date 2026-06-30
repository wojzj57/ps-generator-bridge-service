---
name: ps-generator-bridge-sdk
description: Work on the PS Generator Bridge SDK package. Use when editing packages/sdk, changing src/protocol.ts, adding WebSocket protocol methods, updating Connection/RawConnection/PsBridgeClient behavior, preserving browser-safe SDK boundaries, or authoring external plugin devkit APIs under @ps-generator-bridge/sdk/plugin.
---

# PS Generator Bridge SDK

Use this skill for changes in `packages/sdk`.

## Core Rules

- Treat `packages/sdk/src/protocol.ts` as the protocol source of truth.
- Model any new server capability in `ProtocolMethod` and `ProtocolMethods` before changing the generator server.
- Keep the package root browser-safe and Node-free. Do not import Node built-ins, Fastify, `ws`, generator-core, COS SDK classes, or generator implementation types into root runtime code.
- Use type-only contract imports for plugin authoring types. Runtime plugin primitives live in `src/plugin`; implementation contracts are re-exported as types.
- Preserve `Symbol.for("ps-generator-bridge.*")` brand keys if encountered; they are cross-bundle handshakes.

## Client Surface

- Prefer `Connection` for public user-facing work. It manages reconnects, stable `clientId`, events, JSX, plugin discovery, and built-in modules.
- Use `RawConnection` for lower-level typed `invoke()` and open-ended plugin methods.
- Keep `PsBridgeClient` compatible but do not extend it unless maintaining old callers.
- If adding a convenience method to `Connection`, keep it aligned with `ProtocolMethod` constants instead of string literals.
- For Node 18-21 examples, inject a `WebSocket` implementation. Do not auto-import `ws` from the SDK root.

## Protocol Workflow

When adding a protocol method:

1. Add a constant in `ProtocolMethod`.
2. Add params and result shapes in `ProtocolMethods`.
3. Export any public DTO types from `src/index.ts`.
4. Add protocol/client tests under `packages/sdk/test`.
5. Implement the server handler in `packages/generator` after the SDK contract compiles.

## Tests

Run focused checks:

```bash
pnpm --filter @ps-generator-bridge/sdk typecheck
pnpm --filter @ps-generator-bridge/sdk test
```

SDK tests should use `FakeTransport` or injected transports and must not require Photoshop.
