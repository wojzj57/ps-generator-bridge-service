import { ErrorCode, type ErrorSource, type ProtocolError } from "@ps-generator-bridge/sdk";
import { BridgeError } from "./bridgeError";

export interface ErrorContext {
  requestId?: string;
  method?: string;
  pluginId?: string;
}

const reservedCodes = new Set<string>(Object.values(ErrorCode));

export function toProtocolError(error: unknown, context: ErrorContext = {}): ProtocolError {
  const base = normalizeBase(error);
  return {
    ...base,
    requestId: base.requestId ?? context.requestId,
    method: base.method ?? context.method,
    pluginId: base.pluginId ?? context.pluginId,
  };
}

function normalizeBase(error: unknown): ProtocolError {
  if (error instanceof BridgeError) return error.toProtocolError();

  const thrown = error instanceof Error ? error : new Error(String(error));
  const code = (thrown as { code?: unknown }).code;
  if (typeof code === "string" && !reservedCodes.has(code)) {
    return { code, message: thrown.message, source: "plugin" };
  }
  if (typeof code === "string" && reservedCodes.has(code)) {
    return { code, message: thrown.message, source: sourceForCode(code) };
  }

  const mapped = mapKnownMessage(thrown.message);
  if (mapped) return mapped;
  return { code: ErrorCode.Internal, message: thrown.message, source: "generator" };
}

function mapKnownMessage(message: string): ProtocolError | undefined {
  if (/no open document|no document opened|no document is opened/i.test(message)) {
    return {
      code: ErrorCode.NoDocument,
      message,
      retryable: false,
      source: "photoshop",
    };
  }
  if (/layer missing|invalid layer info|layer not found|invalid layer/i.test(message)) {
    return {
      code: ErrorCode.LayerNotFound,
      message,
      retryable: false,
      source: "photoshop",
    };
  }
  if (/connection rejected|not connected|photoshop.*unavailable/i.test(message)) {
    return {
      code: ErrorCode.PhotoshopUnavailable,
      message,
      retryable: true,
      source: "photoshop",
    };
  }
  return undefined;
}

function sourceForCode(code: string): ErrorSource {
  switch (code) {
    case ErrorCode.NoDocument:
    case ErrorCode.DocumentNotFound:
    case ErrorCode.LayerNotFound:
    case ErrorCode.PhotoshopUnavailable:
      return "photoshop";
    case ErrorCode.PhotoshopBusy:
    case ErrorCode.JsxFailed:
      return "jsx";
    case ErrorCode.PluginNotFound:
    case ErrorCode.PluginLoadFailed:
      return "plugin";
    case ErrorCode.CosUploadFailed:
      return "cos";
    case ErrorCode.BadRequest:
    case ErrorCode.UnknownMethod:
      return "protocol";
    default:
      return "generator";
  }
}
