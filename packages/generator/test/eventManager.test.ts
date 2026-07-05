import { describe, expect, it } from "vitest";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
import { ClientStore } from "../src/utils/clientStore";
import { fakeGenerator } from "./fakeGenerator";

describe("RuntimeEventManager", () => {
  it("isolates plugin-local event scopes", () => {
    const runtime = new RuntimeEventManager(new EventManager(fakeGenerator()));
    const paint = runtime.createPluginFacade("paint");
    const other = runtime.createPluginFacade("other");
    const seen: unknown[] = [];

    paint.on("changed", (payload) => seen.push(["paint", payload]));
    other.on("changed", (payload) => seen.push(["other", payload]));

    paint.emit("changed", { id: 1 });

    expect(seen).toEqual([["paint", { id: 1 }]]);
  });

  it("removes once listeners by the original listener", () => {
    const runtime = new RuntimeEventManager(new EventManager(fakeGenerator()));
    const paint = runtime.createPluginFacade("paint");
    const seen: unknown[] = [];
    const listener = (payload: unknown) => seen.push(payload);

    paint.once("changed", listener);
    paint.off("changed", listener);
    paint.emit("changed", { id: 1 });

    expect(seen).toEqual([]);
  });

  it("awaits remote event watchers before binding the subscription", async () => {
    const runtime = new RuntimeEventManager(new EventManager(fakeGenerator()));
    const clients = new ClientStore();
    const order: string[] = [];
    const socket = { send() {} };
    clients.add("client-1", socket as never);

    runtime.registerRemoteWatcher("selection:changed", async () => {
      order.push("watch:start");
      await Promise.resolve();
      order.push("watch:done");
    });

    await runtime.subscribeRemote({
      scope: { kind: "root" },
      clientId: "client-1",
      clients,
      type: "selection:changed",
    });

    runtime.emitMain("selection:changed", null);
    order.push("emit");

    expect(order).toEqual(["watch:start", "watch:done", "emit"]);
  });

  it("shares a subscribable producer across remote subscribers and disposes after the last unsubscribe", async () => {
    const runtime = new RuntimeEventManager(new EventManager(fakeGenerator()));
    const clients = new ClientStore();
    const socket = { send() {} };
    clients.add("client-1", socket as never);
    clients.add("client-2", socket as never);
    let starts = 0;
    let disposes = 0;

    runtime.registerSubscribable("selection:changed", () => {
      starts += 1;
      return () => {
        disposes += 1;
      };
    });

    await runtime.subscribeRemote({
      scope: { kind: "root" },
      clientId: "client-1",
      clients,
      type: "selection:changed",
    });
    await runtime.subscribeRemote({
      scope: { kind: "root" },
      clientId: "client-2",
      clients,
      type: "selection:changed",
    });

    expect(starts).toBe(1);
    runtime.unsubscribeRemote({
      scope: { kind: "root" },
      clientId: "client-1",
      clients,
      type: "selection:changed",
    });
    expect(disposes).toBe(0);
    runtime.unsubscribeRemote({
      scope: { kind: "root" },
      clientId: "client-2",
      clients,
      type: "selection:changed",
    });
    expect(disposes).toBe(1);
  });

  it("lets internal module subscriptions start a subscribable producer", async () => {
    const runtime = new RuntimeEventManager(new EventManager(fakeGenerator()));
    const host = runtime.createPluginFacade("host");
    let emitSelection: ((payload: unknown) => void) | undefined;
    const seen: unknown[] = [];

    runtime.registerSubscribable("selection:changed", ({ emit }) => {
      emitSelection = emit;
      return () => {
        emitSelection = undefined;
      };
    });

    const unsubscribe = await host.subscribe("selection:changed", (payload) => seen.push(payload));
    emitSelection?.({ x: 1 });
    unsubscribe();
    emitSelection?.({ x: 2 });

    expect(seen).toEqual([{ x: 1 }]);
    expect(emitSelection).toBeUndefined();
  });
});
