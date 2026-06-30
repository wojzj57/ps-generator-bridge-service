import { PsBridgeClient } from "../src/index";

// Manual smoke (run with the "Run SDK Smoke" launch config, or `tsx examples/smoke.ts`).
// Requires a running server — start "Run Server in Photoshop" or "Run Standalone Dev Server".
// Node 22+ has a global WebSocket; on Node 18-21 inject one (see ADR 0002).
const url = "ws://127.0.0.1:49001";

async function main(): Promise<void> {
  const client = new PsBridgeClient({ url });
  try {
    const info = await client.getServerInfo();
    console.log("[smoke] getServerInfo ->", info);
  } finally {
    client.close();
  }
}

void main();
