import type { ClientStore } from "./clientStore";
import { PHOTOSHOP_EVENTS, type EventManager, type PhotoshopEventMap } from "../utilis/eventManager";

const ALLOWED = new Set<string>(PHOTOSHOP_EVENTS);

/**
 * Root /ws Event hub. It bridges Photoshop events into the root ClientStore only
 * while at least one root client is subscribed to a given Event type.
 */
export class EventHub {
  private readonly refs = new Map<keyof PhotoshopEventMap, number>();
  private readonly bridges = new Map<keyof PhotoshopEventMap, (payload: unknown) => void>();

  constructor(
    private readonly events: EventManager,
    private readonly clients: ClientStore
  ) {}

  subscribe(type: string): void {
    const key = this.assertEvent(type);
    const next = (this.refs.get(key) ?? 0) + 1;
    this.refs.set(key, next);
    if (next !== 1) return;
    const bridge = (payload: unknown) => this.clients.broadcastSubscribed(type, payload);
    this.bridges.set(key, bridge);
    this.events.on(key, bridge as (payload: PhotoshopEventMap[typeof key]) => void);
  }

  unsubscribe(type: string): void {
    const key = this.assertEvent(type);
    const current = this.refs.get(key) ?? 0;
    if (current <= 1) {
      this.refs.delete(key);
      const bridge = this.bridges.get(key);
      if (bridge) {
        this.events.off(key, bridge as (payload: PhotoshopEventMap[typeof key]) => void);
        this.bridges.delete(key);
      }
      return;
    }
    this.refs.set(key, current - 1);
  }

  private assertEvent(type: string): keyof PhotoshopEventMap {
    if (!ALLOWED.has(type)) {
      throw new Error(`Unknown Photoshop event: ${type}`);
    }
    return type as keyof PhotoshopEventMap;
  }
}
