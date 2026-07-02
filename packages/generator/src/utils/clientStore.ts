import type { WebSocket } from "ws";
import { serializeFrame } from "@ps-generator-bridge/sdk";

/** One connected client, keyed by its stable clientId (ADR 0007). */
export interface ClientEntry {
  clientId: string;
  socket: WebSocket;
  connectedAt: number;
  /** Event types this client subscribed to. Reserved; not yet filtered on. */
  subscriptions: Set<string>;
}

/**
 * Tracks currently-online clients by clientId (ADR 0007), orthogonal to the
 * Registry (which assembles what the server can do). Used to push Events:
 * `emit` to one client, `broadcast` to all.
 */
export class ClientStore {
  private readonly clients = new Map<string, ClientEntry>();

  /**
   * Register `socket` under `clientId`. If an entry already exists (a reconnect
   * whose old socket is still half-open), the new connection takes over: the old
   * socket is closed and the entry replaced, but subscriptions are preserved.
   */
  add(clientId: string, socket: WebSocket): ClientEntry {
    const existing = this.clients.get(clientId);
    const subscriptions = existing?.subscriptions ?? new Set<string>();
    const entry: ClientEntry = { clientId, socket, connectedAt: Date.now(), subscriptions };
    // Replace the entry first, then close the old socket: its `close` handler runs
    // `remove(clientId, oldSocket)`, which is now a no-op because the entry already
    // points at the new socket.
    this.clients.set(clientId, entry);
    if (existing && existing.socket !== socket) {
      try {
        existing.socket.close();
      } catch {
        // Old socket already dead — nothing to close.
      }
    }
    return entry;
  }

  /**
   * Drop the entry for `clientId` — but only if `socket` is still the current
   * one. A taken-over old socket firing `close` must not evict the live entry.
   */
  remove(clientId: string, socket: WebSocket): ClientEntry | undefined {
    const entry = this.clients.get(clientId);
    if (entry && entry.socket === socket) {
      this.clients.delete(clientId);
      return entry;
    }
    return undefined;
  }

  subscribe(clientId: string, type: string): boolean {
    const entry = this.clients.get(clientId);
    if (!entry || entry.subscriptions.has(type)) return false;
    entry.subscriptions.add(type);
    return true;
  }

  unsubscribe(clientId: string, type: string): boolean {
    const entry = this.clients.get(clientId);
    if (!entry || !entry.subscriptions.has(type)) return false;
    entry.subscriptions.delete(type);
    return true;
  }

  /** Push an Event to one client (no-op if it is not connected). */
  emit(clientId: string, type: string, data: unknown): void {
    const entry = this.clients.get(clientId);
    if (entry) {
      sendEvent(entry.socket, type, data);
    }
  }

  /** Push an Event to every connected client. */
  broadcast(type: string, data: unknown): void {
    for (const entry of this.clients.values()) {
      sendEvent(entry.socket, type, data);
    }
  }

  /** Push an Event only to clients subscribed to that Event type. */
  broadcastSubscribed(type: string, data: unknown): void {
    for (const entry of this.clients.values()) {
      if (entry.subscriptions.has(type)) {
        sendEvent(entry.socket, type, data);
      }
    }
  }
}

function sendEvent(socket: WebSocket, type: string, data: unknown): void {
  socket.send(serializeFrame({ type, data }));
}
