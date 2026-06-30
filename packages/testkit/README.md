# PS Generator Bridge Testkit

Windows-only smoke harness for real Photoshop + Adobe `generator-core` + PS Generator Bridge
plugins.

```bash
ps-bridge-test setup
ps-bridge-test run --plugin ./my-plugin --expect-plugin myPlugin
ps-bridge-test dev --plugins-dir ./plugins
```

Photoshop must already be running with Generator and Remote Connections enabled. The CLI manages
`generator-core` in `%LOCALAPPDATA%\ps-bridge-test\generator-core\master`, starts it against the
published `@ps-generator-bridge/generator`, waits for `/health`, checks `/plugins`, and runs the SDK
`getServerInfo` smoke.
