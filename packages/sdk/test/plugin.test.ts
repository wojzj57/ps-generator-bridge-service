import { describe, it, expect, vi } from "vitest";
import { MainEvent } from "../src/protocol";
import {
  BasePlugin,
  ws,
  api,
  subscribable,
  bootstrap,
  definePlugin,
  type AssemblyTarget,
  type PluginHost,
  type PluginInitContext,
  type MethodHandler,
  type WsHandlerContext,
  type ApiRouteSpec,
  type SubscribableProducer,
} from "../src/plugin";

const handlerContext: WsHandlerContext = {
  clientId: "test-client",
  session: { clientId: "test-client", endpoint: { kind: "root" } },
};

// A minimal PluginHost stand-in: the devkit tests exercise BasePlugin and
// the decorators, neither of which reaches the host, so a bare cast suffices.
const eventOn = vi.fn(() => fakeHost.events);
const eventOnce = vi.fn(() => fakeHost.events);
const eventOff = vi.fn(() => fakeHost.events);

const fakeHost = {
  jsx: {
    run: () => Promise.resolve(),
    execute: () => Promise.resolve(),
    executeBuiltin: () => Promise.resolve(),
  },
  events: {
    subscribe: () => Promise.resolve(() => undefined),
    ensureSubscribable: () => Promise.resolve(),
    on: eventOn,
    once: eventOnce,
    off: eventOff,
    emit: () => true,
    dispose: () => undefined,
  },
  modules: { layer: {}, document: {}, action: {}, image: {}, selection: {} },
} as unknown as PluginHost;

const context = (pluginId: string): PluginInitContext =>
  ({ pluginId, host: fakeHost, ws() {}, api() {} }) as PluginInitContext;

class TestPlugin extends BasePlugin {
  @ws("test:echo")
  echo(params: unknown): unknown {
    return params;
  }

  @api("/thing")
  async thing(): Promise<{ ok: true }> {
    return { ok: true };
  }

  @subscribable("test:changed")
  changed(): () => void {
    return () => undefined;
  }
}

describe("BasePlugin", () => {
  it("stores the plugin id passed through the initializer context", () => {
    const s = new TestPlugin(context("test"));
    expect(s.pluginId).toBe("test");
  });

  it("definePlugin attaches an immutable code-level plugin id", () => {
    const init = definePlugin("paint", () => ({}));
    expect(init.pluginId).toBe("paint");
    expect(() => Object.assign(init, { pluginId: "other" })).toThrow();
  });

  it("does not expose the removed direct push APIs", () => {
    const s = new TestPlugin(context("test"));
    expect("broadcast" in s).toBe(false);
    expect("send" in s).toBe(false);
  });

  it("onConnect/onDisconnect default to no-ops and are overridable", () => {
    class Bare extends BasePlugin {}
    const bare = new Bare(context("bare"));
    expect(() => bare.onConnect("c")).not.toThrow();
    expect(() => bare.onDisconnect("c")).not.toThrow();

    class WithHooks extends BasePlugin {
      seen: string[] = [];
      override onConnect(clientId: string): void {
        this.seen.push(`+${clientId}`);
      }
      override onDisconnect(clientId: string): void {
        this.seen.push(`-${clientId}`);
      }
    }
    const s = new WithHooks(context("with-hooks"));
    s.onConnect("a");
    s.onDisconnect("a");
    expect(s.seen).toEqual(["+a", "-a"]);
  });

  it("lets subclasses listen to main events with this.on", () => {
    class Listener extends BasePlugin {
      listen(): void {
        this.on(MainEvent.SelectionChanged, (area) => {
          area?.width;
        });
      }
    }

    const listener = new Listener(context("listener"));
    listener.listen();

    expect(eventOn).toHaveBeenCalledWith(MainEvent.SelectionChanged, expect.any(Function));
  });
});

describe("decorators + bootstrap", () => {
  function mockTarget(): {
    target: AssemblyTarget;
    methods: Map<string, MethodHandler>;
    apis: ApiRouteSpec[];
    subscribables: Map<string, SubscribableProducer>;
  } {
    const methods = new Map<string, MethodHandler>();
    const apis: ApiRouteSpec[] = [];
    const subscribables = new Map<string, SubscribableProducer>();
    return {
      target: {
        registerMethod: (n, h) => methods.set(n, h),
        registerApi: (r) => apis.push(r),
        registerSubscribable: (t, p) => subscribables.set(t, p),
      },
      methods,
      apis,
      subscribables,
    };
  }

  it("collects @ws/@api metadata and registers bound handlers with the target", () => {
    const { target, methods, apis, subscribables } = mockTarget();
    const s = new TestPlugin(context("test"));
    bootstrap(s, target);

    expect(methods.has("test:echo")).toBe(true);
    expect(apis).toEqual([expect.objectContaining({ method: "GET", url: "/thing" })]);
    expect(subscribables.has("test:changed")).toBe(true);

    // Handler is bound to the instance.
    expect(methods.get("test:echo")!({ hi: 1 }, handlerContext)).toEqual({ hi: 1 });
  });

  it("supports @api({ method, url }) for selecting the verb", () => {
    class PostPlugin extends BasePlugin {
      @api({ method: "POST", url: "/create" })
      create(): unknown {
        return {};
      }
    }
    const { target, apis } = mockTarget();
    bootstrap(new PostPlugin(context("post")), target);
    expect(apis[0]).toMatchObject({ method: "POST", url: "/create" });
  });

  it("does not leak handlers between unrelated classes", () => {
    class Other extends BasePlugin {
      @ws("other:run")
      run(): string {
        return "ok";
      }
    }
    const { target, methods } = mockTarget();
    bootstrap(new Other(context("other")), target);
    expect(methods.has("test:echo")).toBe(false);
    expect(methods.has("other:run")).toBe(true);
    expect(methods.get("other:run")!({}, handlerContext)).toBe("ok");
  });

  it("includes inherited handlers via the metadata prototype chain", () => {
    class Parent extends BasePlugin {
      @ws("parent:p")
      p(): number {
        return 1;
      }
    }
    class Child extends Parent {
      @ws("child:c")
      c(): number {
        return 2;
      }
    }
    const { target, methods } = mockTarget();
    bootstrap(new Child(context("child")), target);
    expect(methods.has("parent:p")).toBe(true); // inherited
    expect(methods.has("child:c")).toBe(true); // own
  });
});
