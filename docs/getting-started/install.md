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

## Generator Runtime Install

Users do not need to clone this repository to install the Photoshop Generator runtime. Run the published CLI directly:

```bash
pnpm dlx @ps-generator-bridge/cli setup
```

By default this installs the minimal runtime into `./generator-bridge`. Pass `--dir` to choose another location:

```bash
pnpm dlx @ps-generator-bridge/cli setup --dir D:\Tools\generator-bridge
```

Re-running `setup` updates installer-managed files while preserving package-local `.env`, `logs/`, `plugins/`, and other user-owned files. It refuses to replace a non-empty directory that is not a managed runtime.

On Windows, the CLI can also install the runtime into a selected Photoshop installation:

```bash
pnpm dlx @ps-generator-bridge/cli setup-photoshop
pnpm dlx @ps-generator-bridge/cli setup-photoshop --version 2025 --yes
```

`setup-photoshop` requires Photoshop to be closed and installs to `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`. It atomically updates only the existing `MachinePrefs.psp` entries needed to enable Generator and Remote Connections, without creating a backup. The Remote Connections password comes from `--password`, `PS_GENERATOR_REMOTE_PASSWORD`, or the default `password`. Managed runtime updates preserve `.env`, `logs/`, `plugins/`, and other user-owned files. If the target contains unmanaged files, the command asks before replacing it; `--yes` authorizes that replacement without prompting.

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
