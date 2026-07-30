import { createHttpClient } from "../../transport";
import type { FetchHtmlResult } from "../../transport";
import { AdapterError } from "../types";
import { readAuto1TransportConfig, type Auto1TransportConfig } from "./config";

export interface LoadedAuto1Html {
  html: string;
  status: number;
  url: string;
}

interface Auto1LoaderOptions {
  config?: Auto1TransportConfig;
  fetchImpl?: typeof globalThis.fetch;
}

export function createAuto1SearchLoader(
  options: Auto1LoaderOptions = {},
): (query: string) => Promise<LoadedAuto1Html> {
  const config = options.config ?? readAuto1TransportConfig();
  const http = createHttpClient({
    sourceId: "auto1",
    baseUrl: config.AUTO1_BASE_URL,
    timeoutMs: config.AUTO1_HTTP_TIMEOUT_MS,
    intervalMs: config.AUTO1_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
  });

  return async (query) => {
    const baseUrl = new URL(config.AUTO1_BASE_URL);
    const url = new URL("/Search", baseUrl);
    if (
      baseUrl.protocol !== "https:" ||
      baseUrl.hostname !== "auto1.by" ||
      url.protocol !== "https:" ||
      url.hostname !== "auto1.by"
    ) {
      throw new AdapterError(
        "auto1",
        "unsupported-query",
        "DOM_CHANGED: разрешён только публичный HTTPS-поиск auto1.by",
      );
    }
    url.searchParams.set("pattern", query);

    const result: FetchHtmlResult = await http.fetchHtml(url.toString());
    return { html: result.html, status: result.status, url: result.url };
  };
}

let defaultLoader: ((query: string) => Promise<LoadedAuto1Html>) | undefined;

export function loadAuto1SearchHtml(query: string): Promise<LoadedAuto1Html> {
  defaultLoader ??= createAuto1SearchLoader();
  return defaultLoader(query);
}
