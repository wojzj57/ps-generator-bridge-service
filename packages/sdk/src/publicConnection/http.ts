import type { PluginHealth, PluginInfo, ProtocolError } from "../protocol";
import { buildHttpEndpoint, DEFAULT_CONNECTION_URL } from "./endpoints";

export interface ConnectionHttpOptions {
  /** Server base URL. Defaults to ws://127.0.0.1:7700. */
  url?: string;
  /** Inject fetch for tests or nonstandard runtimes. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export type ConnectionStatus =
  | Readonly<{ ok: true; status: "ok" }>
  | Readonly<{ ok: false; error: unknown }>;

export async function getConnectionStatus(
  options: ConnectionHttpOptions = {}
): Promise<ConnectionStatus> {
  try {
    const url = buildHttpEndpoint(options.url ?? DEFAULT_CONNECTION_URL, "/health");
    const response = await fetchHttp(url, options.fetch);
    if (!response.ok) throw httpStatusError(url, response);
    const body: unknown = await response.json();
    if (!isHealthResponse(body)) throw new Error(`Malformed response from ${url}`);
    return { ok: true, status: "ok" };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function getPlugins(options: ConnectionHttpOptions = {}): Promise<PluginInfo[]> {
  const url = buildHttpEndpoint(options.url ?? DEFAULT_CONNECTION_URL, "/plugins");
  const response = await fetchHttp(url, options.fetch);
  if (!response.ok) throw httpStatusError(url, response);

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`Malformed JSON from ${url}: ${formatError(error)}`);
  }
  if (!isPluginsResponse(body)) throw new Error(`Malformed response from ${url}`);
  return body.plugins;
}

export async function getPluginHealth(
  id: string,
  options: ConnectionHttpOptions = {}
): Promise<PluginHealth> {
  const path = `/plugins/${encodeURIComponent(id)}/health` as `/${string}`;
  const url = buildHttpEndpoint(options.url ?? DEFAULT_CONNECTION_URL, path);
  const response = await fetchHttp(url, options.fetch);
  if (!response.ok) throw httpStatusError(url, response);

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`Malformed JSON from ${url}: ${formatError(error)}`);
  }
  if (!isPluginHealth(body)) throw new Error(`Malformed response from ${url}`);
  return body;
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (typeof resolved !== "function") {
    throw new Error(
      "Connection HTTP helpers require fetch; pass options.fetch to use this runtime."
    );
  }
  return resolved.bind(globalThis);
}

async function fetchHttp(url: string, fetchImpl?: typeof fetch): Promise<Response> {
  try {
    return await resolveFetch(fetchImpl)(url);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`GET ${url} failed: ${formatError(error)}`);
  }
}

function httpStatusError(url: string, response: Response): Error {
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return new Error(`GET ${url} failed with HTTP ${response.status}${statusText}`);
}

function isHealthResponse(value: unknown): value is { status: "ok" } {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>).status === "ok";
}

function isPluginsResponse(value: unknown): value is { plugins: PluginInfo[] } {
  if (typeof value !== "object" || value === null) return false;
  const plugins = (value as Record<string, unknown>).plugins;
  return Array.isArray(plugins) && plugins.every(isPluginInfo);
}

function isPluginInfo(value: unknown): value is PluginInfo {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).id === "string";
}

function isPluginHealth(value: unknown): value is PluginHealth {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return false;
  if (record.status !== "loaded" && record.status !== "failed") return false;
  if (typeof record.clients !== "number") return false;
  if (record.loadedAt !== undefined && typeof record.loadedAt !== "number") return false;
  if (record.lastError !== undefined && !isProtocolError(record.lastError)) return false;
  if (record.checks !== undefined && !isHealthChecks(record.checks)) return false;
  return true;
}

function isProtocolError(value: unknown): value is ProtocolError {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

function isHealthChecks(value: unknown): value is PluginHealth["checks"] {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (check) => check === "ok" || check === "failed" || check === "skipped"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
