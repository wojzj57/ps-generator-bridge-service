import type { EventName, ProtocolEvents } from "./events";
import type { ProtocolError } from "./errors";
import type { MethodName, ProtocolMethods } from "./methods";

/** A request envelope sent client -> server. */
export interface RequestEnvelope<M extends MethodName = MethodName> {
  id: string;
  method: M;
  params: ProtocolMethods[M]["params"];
}

/** A response envelope sent server -> client. */
export type ResponseEnvelope<M extends MethodName = MethodName> =
  | { id: string; ok: true; result: ProtocolMethods[M]["result"] }
  | { id: string; ok: false; error: ProtocolError };

/** A one-way event envelope sent server -> client (no id, no response). */
export interface EventEnvelope<E extends EventName = EventName> {
  type: E;
  data: ProtocolEvents[E];
}
