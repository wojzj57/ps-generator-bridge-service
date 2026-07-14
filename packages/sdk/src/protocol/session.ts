/**
 * Application close codes used by the bridge WebSocket protocol. Codes in the
 * 4000-4999 range are reserved for application use by RFC 6455.
 */
export const SessionCloseCode = {
  /** The caller intentionally ended the logical session; it must not be resumable. */
  Dispose: 4000,
} as const;

export type SessionCloseCode = (typeof SessionCloseCode)[keyof typeof SessionCloseCode];
