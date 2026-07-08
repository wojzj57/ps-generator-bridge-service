import { bridgeError } from "../errors";

export interface ApiRequestLike {
  body?: unknown;
  params?: unknown;
  query?: unknown;
}

export function bodyRecord(request: ApiRequestLike): Record<string, unknown> {
  if (request.body === undefined || request.body === null) return {};
  if (isRecord(request.body)) return request.body;
  throw bridgeError.badRequest("request body must be a JSON object");
}

export function routeParams(request: ApiRequestLike): Record<string, unknown> {
  return isRecord(request.params) ? request.params : {};
}

export function queryParams(request: ApiRequestLike): Record<string, unknown> {
  return isRecord(request.query) ? request.query : {};
}

export function optionalNumber(
  value: unknown,
  name: string,
  options: { integer?: boolean } = {}
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) throw bridgeError.badRequest(`${name} must be a number`);
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw bridgeError.badRequest(`${name} must be a number`);
  if (options.integer && !Number.isInteger(number)) {
    throw bridgeError.badRequest(`${name} must be an integer`);
  }
  return number;
}

export function requiredNumber(
  value: unknown,
  name: string,
  options: { integer?: boolean } = {}
): number {
  const number = optionalNumber(value, name, options);
  if (number === undefined) throw bridgeError.badRequest(`${name} is required`);
  return number;
}

export function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) throw bridgeError.badRequest(`${name} must be a boolean`);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw bridgeError.badRequest(`${name} must be a boolean`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
