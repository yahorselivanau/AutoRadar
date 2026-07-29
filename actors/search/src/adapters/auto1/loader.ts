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

let requestQueue = Promise.resolve();
let nextRequestAt = 0;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function schedule<T>(
  intervalMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  const scheduled = requestQueue.then(async () => {
    await wait(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + intervalMs;
    return operation();
  });
  requestQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

function isBlockedPage(html: string): boolean {
  return /<title>[^<]*(?:captcha|access denied|http error 429)|(?:class|id)=["'][^"']*(?:captcha|challenge)[^"']*["']|слишком много запросов/i.test(
    html,
  );
}

export function createAuto1SearchLoader(
  options: Auto1LoaderOptions = {},
): (query: string) => Promise<LoadedAuto1Html> {
  const config = options.config ?? readAuto1TransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));

  return (query) =>
    schedule(config.AUTO1_REQUEST_INTERVAL_MS, async () => {
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

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.AUTO1_HTTP_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(url, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": config.AUTO1_USER_AGENT,
          },
          redirect: "error",
          signal: controller.signal,
        });
        const html = await response.text();
        if (response.status === 429 || isBlockedPage(html)) {
          throw new AdapterError(
            "auto1",
            "rate-limited",
            "HTTP_BLOCKED: Auto1.by временно ограничил публичный поиск",
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AdapterError(
            "auto1",
            "blocked",
            `HTTP_BLOCKED: Auto1.by вернул HTTP ${response.status}`,
          );
        }
        if (!response.ok) {
          throw new AdapterError(
            "auto1",
            "network",
            `HTTP_BLOCKED: Auto1.by вернул HTTP ${response.status}`,
          );
        }
        return { html, status: response.status, url: url.toString() };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "auto1",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: поиск Auto1.by не ответил вовремя"
            : "HTTP_BLOCKED: не удалось загрузить публичный поиск Auto1.by",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
}

let defaultLoader: ((query: string) => Promise<LoadedAuto1Html>) | undefined;

export function loadAuto1SearchHtml(query: string): Promise<LoadedAuto1Html> {
  defaultLoader ??= createAuto1SearchLoader();
  return defaultLoader(query);
}
