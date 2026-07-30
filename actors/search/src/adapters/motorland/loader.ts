import { AdapterError } from "../types";
import { createHttpClient } from "../../transport";
import type { FetchHtmlResult } from "../../transport";
import {
  readMotorlandTransportConfig,
  type MotorlandTransportConfig,
} from "./config";

export interface LoadedMotorlandHtml {
  html: string;
  status: number;
  url: string;
}

interface MotorlandLoaderOptions {
  config?: MotorlandTransportConfig;
  fetchImpl?: typeof globalThis.fetch;
}

export function createMotorlandSearchLoader(
  options: MotorlandLoaderOptions = {},
): (query: string) => Promise<LoadedMotorlandHtml> {
  const config = options.config ?? readMotorlandTransportConfig();
  const http = createHttpClient({
    sourceId: "motorland",
    baseUrl: config.MOTORLAND_BASE_URL,
    timeoutMs: config.MOTORLAND_HTTP_TIMEOUT_MS,
    intervalMs: config.MOTORLAND_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
  });

  return async (query) => {
    const baseUrl = new URL(config.MOTORLAND_BASE_URL);
    const url = new URL("/auto-parts/", config.MOTORLAND_BASE_URL);
    if (
      url.protocol !== "https:" ||
      url.hostname !== baseUrl.hostname ||
      baseUrl.hostname !== "motorland.by"
    ) {
      throw new AdapterError(
        "motorland",
        "unsupported-query",
        "DOM_CHANGED: разрешён только публичный HTTPS-поиск motorland.by",
      );
    }
    url.searchParams.set("Filter.TextSearch", query);

    const result: FetchHtmlResult = await http.fetchHtml(url.toString());
    return { html: result.html, status: result.status, url: result.url };
  };
}

let defaultLoader:
  | ((query: string) => Promise<LoadedMotorlandHtml>)
  | undefined;

export function loadMotorlandSearchHtml(
  query: string,
): Promise<LoadedMotorlandHtml> {
  defaultLoader ??= createMotorlandSearchLoader();
  return defaultLoader(query);
}
