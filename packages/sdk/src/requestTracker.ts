import {
  isResponse,
  parseFrame,
  serializeFrame,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "./protocol";
import type { Transport } from "./transport";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

let requestCounter = 0;
function nextId(): string {
  requestCounter += 1;
  return `req-${requestCounter}`;
}

/**
 * Owns Request id generation, pending correlation, timeout handling, and
 * response/error settlement. Connection and the deprecated PsBridgeClient keep
 * their own adapters around readiness/reconnect, but share this lifecycle.
 */
export class RequestTracker {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly timeoutMs: number) {}

  send<M extends string, P, R>(transport: Transport | undefined, method: M, params: P): Promise<R> {
    const id = nextId();
    const envelope: RequestEnvelope = { id, method, params } as RequestEnvelope;
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      transport?.send(serializeFrame(envelope));
    });
  }

  settleFrame(data: string): boolean {
    let message: unknown;
    try {
      message = parseFrame(data);
    } catch {
      return false;
    }
    return this.settle(message);
  }

  settle(message: unknown): boolean {
    if (!isResponse(message)) return false;
    this.settleResponse(message);
    return true;
  }

  failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private settleResponse(message: ResponseEnvelope): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
    }
  }
}
