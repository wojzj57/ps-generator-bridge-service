import { isRequest, type ResponseEnvelope } from "@ps-generator-bridge/sdk";
import type { MethodHandler } from "@ps-generator-bridge/sdk/plugin";
import { runMethod, type HandlerContext } from "./dispatch";

/**
 * Shared Request method table for global and scoped dispatch. The adapters keep
 * their miss behaviour: global Registry turns a miss into UNKNOWN_METHOD, while
 * ScopedRegistry returns undefined so callers can fall back.
 */
export class MethodTable {
  private readonly methods = new Map<string, MethodHandler>();

  register(name: string, handler: MethodHandler): void {
    this.methods.set(name, handler);
  }

  async tryDispatch(
    message: unknown,
    ctx: HandlerContext
  ): Promise<ResponseEnvelope | undefined> {
    if (!isRequest(message)) return undefined;
    const handler = this.methods.get(message.method);
    if (!handler) return undefined;
    return runMethod(handler, message, ctx);
  }
}
