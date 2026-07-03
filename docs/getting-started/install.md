# Install

PS Generator Bridge is a monorepo with three published packages:

- `@ps-generator-bridge/sdk`: isomorphic client SDK and protocol contract
- `@ps-generator-bridge/generator`: Photoshop Generator plugin and WebSocket service
- `@ps-generator-bridge/cli`: command-line tools, including a Windows smoke harness for Photoshop and `generator-core`

## Requirements

- Node.js 18 or newer
- pnpm 11.5.0 for repository development
- Photoshop with Generator support for real Photoshop runs
- Windows for the `@ps-generator-bridge/cli` run/dev smoke commands

## Repository Setup

```bash
pnpm install
pnpm setup
```

`pnpm setup` clones Adobe `generator-core` into `./generator-core`. That directory is ignored by git and is only needed when running the generator through Photoshop.

## SDK Consumer Install

```bash
npm install @ps-generator-bridge/sdk
```

Node 18-21 do not provide a global `WebSocket`. In those runtimes, install and inject `ws`:

```bash
npm install ws
```

```ts
import { Connection } from "@ps-generator-bridge/sdk";
import WebSocket from "ws";

const connection = new Connection({
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

## Development Commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format:check
```

Focused package checks:

```bash
pnpm --filter @ps-generator-bridge/sdk test
pnpm --filter @ps-generator-bridge/generator test
pnpm --filter @ps-generator-bridge/cli typecheck
```
