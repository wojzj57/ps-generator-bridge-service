export interface ProtocolError {
  /**
   * Error code. Server-level codes are values of `ErrorCode`; a plugin may throw
   * its own code (defined in its package), which the server surfaces verbatim
   * (open-ended contract, RFC 0006). Typed here as `string` to admit both.
   */
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  source?: ErrorSource;
  requestId?: string;
  method?: string;
  pluginId?: string;
}

export type ErrorSource = "protocol" | "generator" | "photoshop" | "jsx" | "plugin" | "cos" | "sdk";

/**
 * Server-level error codes. Plugin-specific codes (e.g. SidePaint's
 * `PAINT_GONE`/`IMPORT_FAILED`/`VALUE_RESOLVE`/`UNSUPPORTED_SCHEME`) live in
 * their plugin package since RFC 0006 and are surfaced verbatim by the server.
 */
export const ErrorCode = {
  UnknownMethod: "UNKNOWN_METHOD",
  BadRequest: "BAD_REQUEST",
  Internal: "INTERNAL",
  NoDocument: "NO_DOCUMENT",
  DocumentNotFound: "DOCUMENT_NOT_FOUND",
  LayerNotFound: "LAYER_NOT_FOUND",
  PhotoshopUnavailable: "PHOTOSHOP_UNAVAILABLE",
  PhotoshopBusy: "PHOTOSHOP_BUSY",
  JsxFailed: "JSX_FAILED",
  PluginNotFound: "PLUGIN_NOT_FOUND",
  PluginLoadFailed: "PLUGIN_LOAD_FAILED",
  CosUploadFailed: "COS_UPLOAD_FAILED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
