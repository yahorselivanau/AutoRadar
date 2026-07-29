import { AdapterError } from "../types";
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

export function createMotorlandSearchLoader(
  options: MotorlandLoaderOptions = {},
): (query: string) => Promise<LoadedMotorlandHtml> {
  const config = options.config ?? readMotorlandTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));

  return (query) =>
    schedule(config.MOTORLAND_REQUEST_INTERVAL_MS, async () => {
      const url = new URL("/auto-parts/", config.MOTORLAND_BASE_URL);
      const baseUrl = new URL(config.MOTORLAND_BASE_URL);
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

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.MOTORLAND_HTTP_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(url, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": config.MOTORLAND_USER_AGENT,
          },
          redirect: "error",
          signal: controller.signal,
        });
        const html = await response.text();
        if (response.status === 429 || isBlockedPage(html)) {
          throw new AdapterError(
            "motorland",
            "rate-limited",
            "HTTP_BLOCKED: Motorland временно ограничил публичный поиск",
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AdapterError(
            "motorland",
            "blocked",
            `HTTP_BLOCKED: Motorland вернул HTTP ${response.status}`,
          );
        }
        if (!response.ok) {
          throw new AdapterError(
            "motorland",
            "network",
            `HTTP_BLOCKED: Motorland вернул HTTP ${response.status}`,
          );
        }
        return { html, status: response.status, url: url.toString() };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "motorland",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: поиск Motorland не ответил вовремя"
            : "HTTP_BLOCKED: не удалось загрузить публичный поиск Motorland",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
}

let defaultLoader:
  ((query: string) => Promise<LoadedMotorlandHtml>) | undefined;

export function loadMotorlandSearchHtml(
  query: string,
): Promise<LoadedMotorlandHtml> {
  defaultLoader ??= createMotorlandSearchLoader();
  return defaultLoader(query);
}
