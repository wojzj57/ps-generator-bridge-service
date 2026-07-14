import { ProtocolMethod } from "../protocol";
import { ConnectionInterruptedError } from "../errors";

type EventListener = (data: unknown) => void;

interface SubscriptionTransport {
  invoke(method: typeof ProtocolMethod.EventSubscribe, params: { type: string }): Promise<unknown>;
  invoke(
    method: typeof ProtocolMethod.EventUnsubscribe,
    params: { type: string }
  ): Promise<unknown>;
  on(type: string, listener: EventListener): void;
  off(type: string, listener: EventListener): void;
}

/**
 * High-level Connection event policy. RawConnection remains local-only; this
 * manager mirrors local listeners to remote event:subscribe/unsubscribe calls.
 */
export class SubscriptionManager {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly wrappers = new WeakMap<EventListener, Map<string, EventListener>>();
  private readonly activeSubscriptions = new Set<string>();
  private readonly pendingSubscriptions = new Map<string, symbol>();

  constructor(private readonly transport: SubscriptionTransport) {}

  on(type: string, listener: EventListener): void {
    const hadListeners = this.listenerCount(type) > 0;
    this.add(type, listener);
    this.transport.on(type, listener);
    if (!hadListeners) this.subscribe(type);
  }

  once(type: string, listener: EventListener): void {
    this.removeOnceWrapper(type, listener);
    const wrapped = (data: unknown) => {
      this.off(type, listener);
      listener(data);
    };
    let wrappersByType = this.wrappers.get(listener);
    if (!wrappersByType) {
      wrappersByType = new Map();
      this.wrappers.set(listener, wrappersByType);
    }
    wrappersByType.set(type, wrapped);
    this.on(type, wrapped);
  }

  off(type: string, listener: EventListener): void {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);

    const target = wrapped ?? listener;
    this.transport.off(type, target);
    const removed = this.remove(type, target);
    if (removed && this.listenerCount(type) === 0) this.unsubscribe(type);
  }

  replaySubscriptions(resetPending: boolean): void {
    this.activeSubscriptions.clear();
    if (resetPending) this.pendingSubscriptions.clear();
    for (const type of this.listeners.keys()) {
      this.subscribe(type);
    }
  }

  private add(type: string, listener: EventListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  private remove(type: string, listener: EventListener): boolean {
    const set = this.listeners.get(type);
    if (!set) return false;
    const removed = set.delete(listener);
    if (set.size === 0) this.listeners.delete(type);
    return removed;
  }

  private listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  private removeOnceWrapper(type: string, listener: EventListener): boolean {
    const wrappersByType = this.wrappers.get(listener);
    const wrapped = wrappersByType?.get(type);
    if (!wrapped) return false;
    wrappersByType?.delete(type);
    if (wrappersByType?.size === 0) this.wrappers.delete(listener);
    this.transport.off(type, wrapped);
    return this.remove(type, wrapped);
  }

  private subscribe(type: string): void {
    if (this.activeSubscriptions.has(type) || this.pendingSubscriptions.has(type)) return;
    const pendingToken = Symbol(type);
    this.pendingSubscriptions.set(type, pendingToken);
    void this.transport
      .invoke(ProtocolMethod.EventSubscribe, { type })
      .then(() => {
        if (this.pendingSubscriptions.get(type) === pendingToken && this.listenerCount(type) > 0) {
          this.activeSubscriptions.add(type);
        }
      })
      .catch((error) => {
        if (!(error instanceof ConnectionInterruptedError)) {
          console.warn(`event subscribe failed for ${type}: ${(error as Error).message}`);
        }
      })
      .finally(() => {
        if (this.pendingSubscriptions.get(type) === pendingToken) {
          this.pendingSubscriptions.delete(type);
        }
      });
  }

  private unsubscribe(type: string): void {
    this.activeSubscriptions.delete(type);
    this.pendingSubscriptions.delete(type);
    void this.transport.invoke(ProtocolMethod.EventUnsubscribe, { type }).catch((error) => {
      if (!(error instanceof ConnectionInterruptedError)) {
        console.warn(`event unsubscribe failed for ${type}: ${(error as Error).message}`);
      }
    });
  }
}
