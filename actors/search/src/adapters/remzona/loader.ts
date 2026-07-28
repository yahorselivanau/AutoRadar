import { AdapterError } from "../types";
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

let requestQueue = Promise.resolve();
let nextRequestAt = 0;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

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

function isRateLimitPage(html: string): boolean {
  return (
    /<h2>\s*429\s*<\/h2>/i.test(html) ||
    /Слишком много запросов/i.test(html) ||
    /challenges\.cloudflare\.com\/turnstile/i.test(html)
  );
}

export function createRemzonaHtmlLoader(
  options: RemzonaLoaderOptions = {},
): (query: string) => Promise<LoadedRemzonaHtml> {
  const config = options.config ?? readRemzonaTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));

  return (query) =>
    schedule(config.REMZONA_REQUEST_INTERVAL_MS, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.REMZONA_HTTP_TIMEOUT_MS,
      );

      let response: Response;
      try {
        response = await fetchImpl(config.REMZONA_BASE_URL, {
          method: "POST",
          headers: {
            accept: "text/html, */*; q=0.01",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "user-agent": config.REMZONA_USER_AGENT,
            "x-requested-with": "XMLHttpRequest",
          },
          body: new URLSearchParams({
            typerequest: "search",
            q: query,
          }),
          redirect: "error",
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "remzona",
          timedOut ? "timeout" : "network",
          timedOut
            ? "Таймаут запроса к Remzona"
            : "Ошибка сети при запросе к Remzona",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }

      const html = await response.text();
      if (response.status === 429 || isRateLimitPage(html)) {
        const retryAfterMs =
          parseRetryAfter(response.headers.get("retry-after")) ?? 60_000;
        nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
        throw new AdapterError(
          "remzona",
          "rate-limited",
          "Remzona временно ограничила частоту запросов",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AdapterError(
          "remzona",
          "blocked",
          `Remzona ограничила публичный запрос (HTTP ${response.status})`,
        );
      }
      if (!response.ok) {
        throw new AdapterError(
          "remzona",
          "network",
          `Remzona вернула HTTP ${response.status}`,
        );
      }

      return { html, status: response.status };
    });
}

let defaultLoader: ((query: string) => Promise<LoadedRemzonaHtml>) | undefined;

export function loadRemzonaSearchHtml(
  query: string,
): Promise<LoadedRemzonaHtml> {
  defaultLoader ??= createRemzonaHtmlLoader();
  return defaultLoader(query);
}
