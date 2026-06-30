import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { ws } from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";

/**
 * Action-domain feature module (ADR 0006). Exposes the `Action:*` WS Request
 * methods, each backed by a packaged `jsx/Action/<name>.jsx` script run through
 * the plugin's `JsxRunner` (ADR 0008). A jsx failure follows the `"Error:"`
 * prefix convention: `JsxRunner` throws, and `Registry.dispatch` turns it into an
 * INTERNAL response — the methods themselves do not catch.
 *
 * Migrated from LightAi's `ActionManager`. The `@McpTool` metadata did not carry
 * over (no MCP runtime here — only the `@ws` WS path), but the human-facing
 * descriptions are preserved as method JSDoc.
 */
/**
 * The Action module surface a Plugin reaches through `plugin.modules.action`
 * (RFC 0003). `ActionModule implements` this; the SDK re-exports it via
 * src/contract.ts.
 */
export interface ActionModuleApi {
  autoCutout(): Promise<boolean>;
  removeBackground(): Promise<{ success: boolean }>;
}

export class ActionModule extends BaseModule implements ActionModuleApi {
  constructor(plugin: PsBridgeHost) {
    super("action", plugin);
  }

  /**
   * Automatically create a selection for the main subject of the current layer.
   * Runs `jsx/Action/autoCutout.jsx`. The jsx return value is not consulted:
   * success is implicit, and a failure surfaces as a thrown error (hence an
   * INTERNAL response), so this always resolves to `true` on the happy path.
   */
  @ws(ProtocolMethod.ActionAutoCutout)
  async autoCutout(): Promise<boolean> {
    await this.plugin.jsx.executeSafe("Action/autoCutout");
    return true;
  }

  /**
   * Remove the background of the current layer. Runs `jsx/Action/removeBackground.jsx`
   * and wraps the jsx's boolean result as `{ success }`.
   */
  @ws(ProtocolMethod.ActionRemoveBackground)
  async removeBackground(): Promise<{ success: boolean }> {
    const result = await this.plugin.jsx.executeSafe<boolean>("Action/removeBackground");
    return { success: result };
  }
}
