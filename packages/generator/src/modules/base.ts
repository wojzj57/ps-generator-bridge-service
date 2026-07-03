import type { PsBridgeHost } from "../plugin";

/**
 * Base class for feature modules (ADR 0006). A module reaches every dependency
 * through `this.plugin`, including Photoshop, logging, JSX, modules, and runtime
 * events. Methods are exposed via the `@ws` / `@api` decorators and wired up by
 * `bootstrap`.
 */
export abstract class BaseModule {
  constructor(
    public readonly name: string,
    public readonly plugin: PsBridgeHost
  ) {}
}
