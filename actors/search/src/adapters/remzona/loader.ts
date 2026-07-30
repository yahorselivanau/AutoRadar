import { AdapterError } from "../types";
import { createHttpClient } from "../../transport";
import type { FetchHtmlResult } from "../../transport";
import {
  readRemzonaTransportConfig,
  type RemzonaTransportConfig,
} from "./config";

export interface LoadedRemzonaHtml {
  html: string;
  status: number;
}

interface RemzonaLoaderOptions {
  config?: RemzonaTransportConfig;
  fetchImpl?: typeof globalThis.fetch;
}

export type RemzonaPageLoader = (path: string) => Promise<LoadedRemzonaHtml>;

export function createRemzonaHtmlLoader(
  options: RemzonaLoaderOptions = {},
): (query: string) => Promise<LoadedRemzonaHtml> {
  const config = options.config ?? readRemzonaTransportConfig();
  const http = createHttpClient({
    sourceId: "remzona",
    baseUrl: config.REMZONA_BASE_URL,
    timeoutMs: config.REMZONA_HTTP_TIMEOUT_MS,
    intervalMs: config.REMZONA_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
  });

  return async (query) => {
    const result: FetchHtmlResult = await http.fetchHtml(
      config.REMZONA_BASE_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: new URLSearchParams({
          typerequest: "search",
          q: query,
        }),
      },
    );
    return { html: result.html, status: result.status };
  };
}

function resolveRemzonaUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  const base = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== base.hostname) {
    throw new AdapterError(
      "remzona",
      "unsupported-query",
      "DOM_CHANGED: Remzona вернула ссылку вне разрешённого источника",
    );
  }
  return url.toString();
}

export function createRemzonaPageLoader(
  options: RemzonaLoaderOptions = {},
): RemzonaPageLoader {
  const config = options.config ?? readRemzonaTransportConfig();
  const http = createHttpClient({
    sourceId: "remzona",
    baseUrl: config.REMZONA_BASE_URL,
    timeoutMs: config.REMZONA_HTTP_TIMEOUT_MS,
    intervalMs: config.REMZONA_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
  });

  return async (path) => {
    const url = resolveRemzonaUrl(config.REMZONA_BASE_URL, path);
    const result: FetchHtmlResult = await http.fetchHtml(url);
    return { html: result.html, status: result.status };
  };
}

export async function loadRemzonaPlaywrightHtml(
  path: string,
  selector: string,
): Promise<LoadedRemzonaHtml> {
  const config = readRemzonaTransportConfig();
  const url = resolveRemzonaUrl(config.REMZONA_BASE_URL, path);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: config.REMZONA_USER_AGENT,
    });
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.REMZONA_HTTP_TIMEOUT_MS,
    });
    await page.locator(selector).first().waitFor({
      state: "attached",
      timeout: config.REMZONA_HTTP_TIMEOUT_MS,
    });
    return {
      html: await page.content(),
      status: response?.status() ?? 200,
    };
  } catch (error) {
    throw new AdapterError(
      "remzona",
      "timeout",
      "TIMEOUT: Playwright fallback не дождался карточек Remzona",
      { cause: error },
    );
  } finally {
    await browser.close();
  }
}

let defaultLoader: ((query: string) => Promise<LoadedRemzonaHtml>) | undefined;
let defaultPageLoader: RemzonaPageLoader | undefined;

export function loadRemzonaSearchHtml(
  query: string,
): Promise<LoadedRemzonaHtml> {
  defaultLoader ??= createRemzonaHtmlLoader();
  return defaultLoader(query);
}

export function loadRemzonaPageHtml(path: string): Promise<LoadedRemzonaHtml> {
  defaultPageLoader ??= createRemzonaPageLoader();
  return defaultPageLoader(path);
}
