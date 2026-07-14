---
"@ps-generator-bridge/sdk": minor
"@ps-generator-bridge/generator": minor
---

Move WebSocket client identity ownership to the generator server. Connections now receive a server-issued `clientId`, resume logical sessions with `?resume=`, replay subscriptions after reconnect, and expose handler session context. Explicit SDK closes dispose sessions immediately, while unexpected disconnects remain resumable for a configurable 30-minute TTL.

Remove caller-selected `clientId`/`?id=` connection options. Persist `connection.clientId` externally and pass it back as `resume` when identity must survive a client process restart.
