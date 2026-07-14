---
"@ps-generator-bridge/sdk": minor
"@ps-generator-bridge/generator": minor
---

Allow callers to choose a stable `clientId`, use the canonical `?clientId=`
handshake parameter with legacy `?id=` compatibility, and add
`Connection.reconnect()` for immediate identity-preserving reconnects.
