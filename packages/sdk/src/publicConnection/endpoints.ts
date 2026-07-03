import type { RawConnectionOptions } from "../connection";

export const DEFAULT_CONNECTION_URL = "ws://127.0.0.1:7700";

export type ConnectionEndpoint =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "plugin"; pluginId: string }>;

export interface ConnectionOptions extends Omit<RawConnectionOptions, "url"> {
  /** Server base URL. Defaults to ws://127.0.0.1:7700. */
  url?: string;
}

export function parseConnectionArgs(
  pluginIdOrOptions: string | ConnectionOptions | undefined,
  options: ConnectionOptions
): { endpoint: ConnectionEndpoint; options: ConnectionOptions } {
  if (typeof pluginIdOrOptions === "string") {
    return {
      endpoint: Object.freeze({ kind: "plugin", pluginId: pluginIdOrOptions }),
      options,
    };
  }
  return {
    endpoint: Object.freeze({ kind: "root" }),
    options: pluginIdOrOptions ?? {},
  };
}

export function buildWebSocketEndpoint(baseUrl: string, endpoint: ConnectionEndpoint): string {
  const url = new URL(baseUrl);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Unsupported connection URL protocol: ${url.protocol}`);
  }

  const basePath = url.pathname.replace(/\/+$/, "");
  const endpointPath =
    endpoint.kind === "root" ? "/ws" : `/ws/${encodeURIComponent(endpoint.pluginId)}`;
  url.pathname = `${basePath}${endpointPath}`;
  return url.toString();
}

export function buildHttpEndpoint(baseUrl: string, path: `/${string}`): string {
  const url = new URL(baseUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported connection URL protocol: ${url.protocol}`);
  }

  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}${path}`;
  return url.toString();
}
