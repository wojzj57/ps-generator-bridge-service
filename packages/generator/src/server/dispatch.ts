import {
  ErrorCode,
  isRequest,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@ps-generator-bridge/sdk";
import type { MethodHandler } from "@ps-generator-bridge/sdk/plugin";
import type { PsGenerator } from "../types/generator";
import type { JsxRunnerApi } from "../utilis/jsxRunner";

export interface ConnectionSession {
  readonly clientId: string;
  subscribe(type: string): void;
  unsubscribe(type: string): void;
}

/** What method handlers receive: the injected PS generator + future additions. */
export interface HandlerContext {
  generator: PsGenerator;
  jsx?: JsxRunnerApi;
  session?: ConnectionSession;
}

/** Build an UnknownMethod response envelope for a request frame. */
export function unknownMethodResponse(id: string, method: string): ResponseEnvelope {
  return {
    id,
    ok: false,
    error: { code: ErrorCode.UnknownMethod, message: `Unknown method: ${method}` },
  };
}

/**
 * Run one request handler and wrap its result (or thrown error) in a response
 * envelope. Shared by the global Registry and the per-plugin scoped table
 * (RFC 0004) so error-code passthrough stays consistent.
 *
 * Open-ended (ADR 0006 / RFC 0006): a handler may throw a typed Error carrying a
 * string `code`; any string code is surfaced verbatim so external plugins can
 * define their own codes (e.g. SidePaint's `PAINT_GONE`) without the server
 * needing to know them. Errors without a string `code` fall back to INTERNAL.
 */
export async function runMethod(
  handler: MethodHandler,
  message: RequestEnvelope,
  ctx: HandlerContext
): Promise<ResponseEnvelope> {
  try {
    const result = await handler(message.params, ctx);
    // Open-ended contract (ADR 0006): result type is unknown at this layer; the
    // SDK re-applies strong types for declared methods.
    return { id: message.id, ok: true, result } as ResponseEnvelope;
  } catch (error) {
    const thrown = error instanceof Error ? error : new Error(String(error));
    const code = (thrown as { code?: unknown }).code;
    const resolvedCode = typeof code === "string" ? code : ErrorCode.Internal;
    return {
      id: message.id,
      ok: false,
      error: {
        code: resolvedCode,
        message: thrown.message,
      },
    };
  }
}

/** Re-exported for the server's WS handler (frame discrimination). */
export { isRequest };
