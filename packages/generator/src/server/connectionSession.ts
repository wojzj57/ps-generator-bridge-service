import { randomUUID } from "node:crypto";
import { serializeFrame } from "@ps-generator-bridge/sdk";
import type { WsEndpoint, WsSession } from "@ps-generator-bridge/sdk/plugin";
import type { RuntimeEventManager } from "../utils/eventManager";

export const DEFAULT_SESSION_RESUME_TTL_MS = 30 * 60 * 1_000;

interface SessionSubscription {
  type: string;
  dispose: () => void;
}

export interface SessionStoreOptions {
  endpoint: WsEndpoint;
  events: RuntimeEventManager;
  resumeTtlMs?: number;
  onDispose?: (clientId: string) => void;
}

export interface SessionConnectResult {
  session: ConnectionSession;
  created: boolean;
}

/**
 * One server-issued logical connection identity. The raw socket is deliberately
 * private: plugin handlers receive only the platform-neutral WsSession view.
 */
export class ConnectionSession implements WsSession {
  readonly subscriptions = new Map<string, SessionSubscription>();
  private socket: any;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly clientId: string,
    readonly endpoint: WsEndpoint,
    socket: any,
    private readonly store: SessionStore,
    private readonly events: RuntimeEventManager
  ) {
    this.socket = socket;
  }

  get connected(): boolean {
    return this.socket !== undefined;
  }

  isCurrentSocket(socket: any): boolean {
    return this.socket === socket;
  }

  /** Replace the physical socket while preserving the logical session. */
  replaceSocket(socket: any): any | undefined {
    const previous = this.socket;
    this.clearResumeTimer();
    this.releaseSubscriptions();
    this.socket = socket;
    return previous;
  }

  /** Detach only when the closing socket is still authoritative. */
  detachSocket(socket: any): boolean {
    if (this.socket !== socket) return false;
    this.socket = undefined;
    this.releaseSubscriptions();
    return true;
  }

  scheduleExpiry(ttlMs: number, expire: () => void): void {
    this.clearResumeTimer();
    const timer = setTimeout(expire, ttlMs);
    timer.unref?.();
    this.resumeTimer = timer;
  }

  clearResumeTimer(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = undefined;
  }

  subscribe(type: string): Promise<void> {
    return this.events.subscribeRemote({
      scope: this.endpoint,
      clientId: this.clientId,
      sessions: this.store,
      type,
    });
  }

  unsubscribe(type: string): void {
    this.events.unsubscribeRemote({
      scope: this.endpoint,
      clientId: this.clientId,
      sessions: this.store,
      type,
    });
  }

  releaseSubscriptions(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.dispose();
    }
    this.subscriptions.clear();
  }

  send(type: string, data: unknown): void {
    this.socket?.send(serializeFrame({ type, data }));
  }

  dispose(): void {
    const socket = this.socket;
    this.clearResumeTimer();
    this.releaseSubscriptions();
    this.socket = undefined;
    try {
      socket?.close();
    } catch {
      // Server shutdown also disposes sockets that may already be closed.
    }
  }
}

/**
 * Per-endpoint store for connected and temporarily recoverable sessions.
 * Unknown, expired, or malformed resume ids always create a fresh identity.
 */
export class SessionStore {
  private readonly sessions = new Map<string, ConnectionSession>();
  private readonly resumeTtlMs: number;

  constructor(private readonly options: SessionStoreOptions) {
    this.resumeTtlMs = options.resumeTtlMs ?? DEFAULT_SESSION_RESUME_TTL_MS;
  }

  /** Number of currently connected sessions (recoverable sessions are offline). */
  get count(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.connected) count += 1;
    }
    return count;
  }

  connect(resume: unknown, socket: any): SessionConnectResult {
    const existing = isServerIssuedClientId(resume) ? this.sessions.get(resume) : undefined;
    if (existing) {
      const previous = existing.replaceSocket(socket);
      if (previous && previous !== socket) {
        try {
          previous.close();
        } catch {
          // The stale socket is already gone; its close callback is identity-guarded.
        }
      }
      return { session: existing, created: false };
    }

    let clientId = randomUUID();
    while (this.sessions.has(clientId)) clientId = randomUUID();
    const session = new ConnectionSession(
      clientId,
      this.options.endpoint,
      socket,
      this,
      this.options.events
    );
    this.sessions.set(clientId, session);
    return { session, created: true };
  }

  disconnect(session: ConnectionSession, socket: any, dispose: boolean): boolean {
    if (!session.detachSocket(socket)) return false;
    if (dispose) {
      this.dispose(session);
    } else {
      session.scheduleExpiry(this.resumeTtlMs, () => this.dispose(session));
    }
    return true;
  }

  subscribe(clientId: string, type: string, bind: () => () => void): boolean {
    const session = this.sessions.get(clientId);
    if (!session?.connected || session.subscriptions.has(type)) return false;
    const dispose = bind();
    session.subscriptions.set(type, { type, dispose });
    return true;
  }

  unsubscribe(clientId: string, type: string): boolean {
    const session = this.sessions.get(clientId);
    const subscription = session?.subscriptions.get(type);
    if (!session || !subscription) return false;
    subscription.dispose();
    session.subscriptions.delete(type);
    return true;
  }

  emit(clientId: string, type: string, data: unknown): void {
    this.sessions.get(clientId)?.send(type, data);
  }

  /** Dispose every active or recoverable session without lifecycle callbacks. */
  clear(): void {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) session.dispose();
  }

  private dispose(session: ConnectionSession): void {
    if (this.sessions.get(session.clientId) !== session) return;
    this.sessions.delete(session.clientId);
    session.dispose();
    this.options.onDispose?.(session.clientId);
  }
}

function isServerIssuedClientId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
