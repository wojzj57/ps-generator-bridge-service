import type { Transport } from "../src/connection/transport";

/**
 * In-memory Transport that records sent frames and lets a test push responses.
 * No real socket — this is the SDK's primary test seam (ADR 0002).
 */
export class FakeTransport implements Transport {
  readonly sent: string[] = [];
  closed = false;
  private listener: ((data: string) => void) | undefined;
  private closeListener: (() => void) | undefined;

  ready(): Promise<void> {
    return Promise.resolve();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  onMessage(listener: (data: string) => void): void {
    this.listener = listener;
  }

  onClose(listener: () => void): void {
    this.closeListener = listener;
  }

  close(): void {
    this.closed = true;
    this.closeListener?.();
  }

  /** Test helper: simulate a server frame arriving. */
  emit(data: string): void {
    this.listener?.(data);
  }

  /** Test helper: simulate the connection dropping. */
  simulateClose(): void {
    this.closeListener?.();
  }

  /** Test helper: the last sent frame, parsed. */
  lastSent(): unknown {
    const last = this.sent.at(-1);
    return last === undefined ? undefined : JSON.parse(last);
  }
}
