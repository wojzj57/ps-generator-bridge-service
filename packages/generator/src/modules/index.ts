import type { BaseModule } from "./base";
import type { PsBridgeHost } from "../plugin";
import { ActionModule } from "./action";
import { DocumentModule } from "./document";
import { LayerModule } from "./layer";
import { ImageModule } from "./image";

export { ActionModule } from "./action";
export { DocumentModule } from "./document";
export { LayerModule } from "./layer";
export { ImageModule } from "./image";
export type { BaseModule } from "./base";

/** A module class: constructible from the owning plugin (it calls super(name, plugin)). */
export type ModuleClass = new (plugin: PsBridgeHost) => BaseModule;

/**
 * Explicit module manifest (ADR 0006). The bundle has no source directory to scan
 * at runtime, so feature modules must be listed here, keyed by the short name the
 * plugin exposes them under (`plugin.modules.<key>`). The plugin instantiates each
 * with itself and bootstraps the decorated handlers. `@ws`/`@api` names are
 * written in full by the developer (`Domain:action`, mirroring the `jsx/<Domain>/`
 * layout and the SDK's declared `ProtocolMethods` contract); `bootstrap` does not
 * inject a namespace.
 */
export const MODULES = {
  layer: LayerModule,
  document: DocumentModule,
  action: ActionModule,
  image: ImageModule,
} satisfies Record<string, ModuleClass>;
