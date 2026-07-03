import type { ErrorSource, ProtocolError } from "../protocol";

export interface PsBridgeErrorContext {
  requestId?: string;
  method?: string;
  pluginId?: string;
}

export class PsBridgeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly retryable?: boolean;
  readonly source?: ErrorSource | string;
  readonly requestId?: string;
  readonly method?: string;
  readonly pluginId?: string;

  constructor(error: ProtocolError, fallback: PsBridgeErrorContext = {}) {
    super(error.message);
    this.name = "PsBridgeError";
    this.code = error.code;
    this.details = error.details;
    this.retryable = error.retryable;
    this.source = error.source;
    this.requestId = error.requestId ?? fallback.requestId;
    this.method = error.method ?? fallback.method;
    this.pluginId = error.pluginId ?? fallback.pluginId;
  }

  static fromProtocolError(error: ProtocolError, fallback?: PsBridgeErrorContext): PsBridgeError {
    return new PsBridgeError(error, fallback);
  }
}

export function isPsBridgeError(error: unknown): error is PsBridgeError {
  return error instanceof PsBridgeError;
}

export function isRetryableBridgeError(error: unknown): boolean {
  return isPsBridgeError(error) && error.retryable === true;
}
