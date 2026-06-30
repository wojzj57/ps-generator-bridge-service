import { ErrorCode, type ErrorSource, type ProtocolError } from "@ps-generator-bridge/sdk";

export interface BridgeErrorOptions {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  source?: ErrorSource;
}

export class BridgeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly retryable?: boolean;
  readonly source?: ErrorSource;

  constructor(options: BridgeErrorOptions) {
    super(options.message);
    this.name = "BridgeError";
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable;
    this.source = options.source;
  }

  toProtocolError(): ProtocolError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      source: this.source,
    };
  }
}

export const bridgeError = {
  badRequest(message: string, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({ code: ErrorCode.BadRequest, message, details, source: "protocol" });
  },
  noDocument(message = "No document is opened", details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.NoDocument,
      message,
      details,
      retryable: false,
      source: "photoshop",
    });
  },
  documentNotFound(documentId: number, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.DocumentNotFound,
      message: `Document not found: ${documentId}`,
      details: { documentId, ...details },
      retryable: false,
      source: "photoshop",
    });
  },
  layerNotFound(layerSpec: unknown, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.LayerNotFound,
      message: `Layer not found: ${String(layerSpec)}`,
      details: { layerSpec, ...details },
      retryable: false,
      source: "photoshop",
    });
  },
  jsxFailed(message: string, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({ code: ErrorCode.JsxFailed, message, details, source: "jsx" });
  },
  photoshopUnavailable(message: string, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.PhotoshopUnavailable,
      message,
      details,
      retryable: true,
      source: "photoshop",
    });
  },
  photoshopBusy(message: string, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.PhotoshopBusy,
      message,
      details,
      retryable: true,
      source: "jsx",
    });
  },
  cosUploadFailed(message: string, details?: Record<string, unknown>): BridgeError {
    return new BridgeError({
      code: ErrorCode.CosUploadFailed,
      message,
      details,
      retryable: true,
      source: "cos",
    });
  },
  pluginNotFound(pluginId: string): BridgeError {
    return new BridgeError({
      code: ErrorCode.PluginNotFound,
      message: `unknown plugin: ${pluginId}`,
      details: { pluginId },
      retryable: false,
      source: "plugin",
    });
  },
  pluginLoadFailed(pluginId: string, reason: string): BridgeError {
    return new BridgeError({
      code: ErrorCode.PluginLoadFailed,
      message: `plugin load failed: ${pluginId}`,
      details: { pluginId, reason },
      retryable: false,
      source: "plugin",
    });
  },
};
