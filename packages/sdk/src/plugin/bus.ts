/**
 * Per-plugin client push bus (RFC 0004). BasePlugin.broadcast/send delegate to
 * this; the server's per-plugin assembler attaches a concrete adapter backed by
 * the plugin's own ClientStore after construction. Defined in the SDK so
 * BasePlugin can be implemented without depending on the server.
 */
export interface PluginClientBus {
  /** Push an Event to every online client of this plugin. */
  broadcast(type: string, data: unknown): void;
  /** Push an Event to one client of this plugin (no-op if not connected). */
  send(clientId: string, type: string, data: unknown): void;
}
