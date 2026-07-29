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

export type RemzonaPageLoader = (path: string) => Promise<LoadedRemzonaHtml>;

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
            ? "TIMEOUT: публичный поиск Remzona не ответил вовремя"
            : "HTTP_BLOCKED: ошибка сети при запросе к Remzona",
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
          "HTTP_BLOCKED: Remzona временно ограничила частоту запросов",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AdapterError(
          "remzona",
          "blocked",
          `HTTP_BLOCKED: Remzona ограничила публичный запрос (HTTP ${response.status})`,
        );
      }
      if (!response.ok) {
        throw new AdapterError(
          "remzona",
          "network",
          `HTTP_BLOCKED: Remzona вернула HTTP ${response.status}`,
        );
      }

      return { html, status: response.status };
    });
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
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));

  return (path) =>
    schedule(config.REMZONA_REQUEST_INTERVAL_MS, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.REMZONA_HTTP_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(
          resolveRemzonaUrl(config.REMZONA_BASE_URL, path),
          {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": config.REMZONA_USER_AGENT,
            },
            redirect: "error",
            signal: controller.signal,
          },
        );
        const html = await response.text();
        if (response.status === 429 || isRateLimitPage(html)) {
          throw new AdapterError(
            "remzona",
            "rate-limited",
            "HTTP_BLOCKED: Remzona ограничила частоту запросов",
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AdapterError(
            "remzona",
            "blocked",
            `HTTP_BLOCKED: Remzona вернула HTTP ${response.status}`,
          );
        }
        if (!response.ok) {
          throw new AdapterError(
            "remzona",
            "network",
            `HTTP_BLOCKED: Remzona вернула HTTP ${response.status}`,
          );
        }
        return { html, status: response.status };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "remzona",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: страница Remzona не ответила вовремя"
            : "HTTP_BLOCKED: не удалось загрузить страницу Remzona",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
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
