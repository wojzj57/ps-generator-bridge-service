# PS Generator Bridge Service

A Photoshop Generator monorepo:

- **`packages/generator`** (`@ps-generator-bridge/generator`) — a Generator plugin that runs inside
  Photoshop's bundled Node runtime, loaded by `generator-core`. It owns a WebSocket server and
  exposes its capabilities to outside clients via a shared protocol.
- **`packages/sdk`** (`@ps-generator-bridge/sdk`) — a pure-TS, isomorphic (browser + Node ≥ 18)
  client SDK. It connects to the server over WebSocket and is the **single source of truth for the
  protocol contract**; `server` depends on it (type-only).

See [`CONTEXT.md`](./CONTEXT.md) for the glossary and [`docs/rfcs/`](./docs/rfcs) for the architecture
decisions (why WebSocket client/server, why an injected transport, why the server owns its own `ws`).

## Layout

```
packages/sdk        # isomorphic client + protocol contract (source of truth)
packages/generator  # in-PS plugin + WebSocket service
generator-core      # Adobe generator-core (cloned by `pnpm setup`, gitignored)
.vscode             # F5 debug configs (see Manual testing)
```

## Install

```bash
pnpm install
pnpm setup   # clones Adobe generator-core into ./generator-core (required to run in PS)
```

## Scripts (root)

| command          | effect                                       |
| ---------------- | -------------------------------------------- |
| `pnpm build`     | build both packages (sdk first, topological) |
| `pnpm typecheck` | `tsc --noEmit` in both packages              |
| `pnpm test`      | vitest + coverage gate (per package)         |
| `pnpm format`    | Prettier write                               |

## Testing

Unit tests run in CI without Photoshop, built entirely on injected seams
(`FakeTransport` for the SDK, `FakeGenerator` for the server). Coverage gate per package:
**80% lines/functions/statements, 70% branches**. See [`packages/generator/TESTING.md`](./packages/generator/TESTING.md)
for what is in/out of scope.

## Manual testing (VSCode, F5)

1. **Run Server in Photoshop** — builds the server, launches `generator-core` pointed at
   `packages/generator`, connects to a local Photoshop (requires PS "enable remote connections",
   password `password`). The server registers a "File > Generate" menu item and starts its WebSocket
   service on `ws://127.0.0.1:49001`.
2. **Run Standalone Dev Server (Fake PS)** — starts the WebSocket service with a fake generator, so
   you can exercise the SDK **without Photoshop**.
3. **Run SDK Smoke** — runs `packages/sdk/examples/smoke.ts`, which connects and calls
   `getServerInfo()`. Start (1) or (2) first.
