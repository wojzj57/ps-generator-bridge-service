import type { EventEnvelope, RequestEnvelope, ResponseEnvelope } from "./envelopes";

/**
 * Frame discriminators shared by both ends (ADR 0005). The three envelope kinds
 * are told apart by characteristic fields: Request has `method`, Response has a
 * boolean `ok`, Event has `type` and no `id`.
 */
export function isRequest(value: unknown): value is RequestEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.method === "string";
}

export function isResponse(value: unknown): value is ResponseEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.ok === "boolean";
}

export function isEvent(value: unknown): value is EventEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && v.id === undefined;
}

/** Decode a raw text frame. Throws on invalid JSON. Shared by both ends. */
export function parseFrame(data: string): unknown {
  return JSON.parse(data);
}

/** Encode a value into a text frame. Shared by both ends. */
export function serializeFrame(value: unknown): string {
  return JSON.stringify(value);
}
