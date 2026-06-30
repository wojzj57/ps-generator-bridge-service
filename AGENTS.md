# PS Generator Bridge Service — AI Agent guide

> Progressive-disclosure entry point for coding agents. Read this first, then jump to the deeper docs.

## One line

A Photoshop Generator monorepo: a **generator** plugin runs inside Photoshop's bundled Node runtime
and owns a WebSocket server; an isomorphic **sdk** is the client and the single source of truth for
the protocol contract. `generator` depends on `sdk` type-only.

## Packages

| Package              | npm                              | Role                                                                                          |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/sdk`       | `@ps-generator-bridge/sdk`       | Isomorphic client + protocol contract (source of truth). Zero PS/Node coupling, browser-safe. |
| `packages/generator` | `@ps-generator-bridge/generator` | In-PS Generator plugin + WebSocket service. Loaded by `generator-core`.                       |
| `packages/testkit`   | `@ps-generator-bridge/testkit`   | Windows PS + `generator-core` smoke harness (CLI `ps-bridge-test`).                           |

## Commands

- `pnpm install` — install workspace deps.
- `pnpm setup` — clone Adobe `generator-core` into `./generator-core` (gitignored; required to run in PS).
- `pnpm build` / `pnpm typecheck` / `pnpm test` — across all packages (`pnpm -r`).

## Conventions (do not break)

1. **Protocol is the source of truth**: model a new server capability in `packages/sdk/src/protocol.ts`
   (`ProtocolMethods`) first, then implement it on the server.
2. **SDK stays Node-free / browser-safe**: never leak server, fastify, COS-SDK, or other Node-only
   types into `packages/sdk`. Cross the boundary with narrow type-only contracts (see `contract.ts`).
3. **`Symbol.for("ps-generator-bridge.*")` brand keys** are a cross-bundle handshake with external
   plugins — changing them breaks plugin interop.
4. **Config vs env**: secrets and deployment knobs go through `PS_BRIDGE_*` env vars; structured run
   params (`port`, `pluginsDir`) come via `PluginConfig` and env only overrides.
5. **Tests** are TypeScript via injected seams (`FakeGenerator`, `FakeTransport`); no real Photoshop
   needed for unit tests.

## Deeper docs

- `CONTEXT.md` — the glossary (ubiquitous language).
- `docs/rfcs/` — architecture decision records (protocol, plugin model, image/COS, rebrand).
- `packages/generator/TESTING.md` — what is in/out of unit-test scope.
