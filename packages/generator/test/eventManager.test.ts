import { describe, expect, it } from "vitest";
import { EventManager, RuntimeEventManager } from "../src/utils/eventManager";
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
});
