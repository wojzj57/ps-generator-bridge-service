# Photoshop Setup

Real Photoshop runs use Adobe `generator-core`. The repository setup script clones it into a gitignored local directory.

```bash
pnpm setup
```

## Photoshop Requirements

- Photoshop installed
- Generator enabled
- Remote Connections enabled
- The generator package built before loading through generator-core

## Local Development Flow

```bash
pnpm install
pnpm setup
pnpm --filter @ps-generator-bridge/generator build
```

The generator package is loaded through its CommonJS `main.js` entry. The exported `init(generator, config)` function constructs `PsBridgeHost`, registers the menu item, loads plugins, registers modules, initializes JSX polyfills, and starts the service.

## Smoke Harness

Use `@ps-generator-bridge/testkit` on Windows to verify the real Photoshop boot path:

```bash
ps-bridge-test setup
ps-bridge-test run --plugin ./my-plugin --expect-plugin myPlugin
```

The harness waits for `/health`, checks `/plugins`, and runs an SDK `getServerInfo` call.
