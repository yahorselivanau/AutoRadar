import { AdapterError } from "../types";
import { readZapTransportConfig, type ZapTransportConfig } from "./config";

export interface LoadedZapHtml {
  html: string;
  path: string;
  status: number;
}

export type ZapPageLoader = (path: string) => Promise<LoadedZapHtml>;

interface ZapLoaderOptions {
  config?: ZapTransportConfig;
  fetchImpl?: typeof fetch;
}

let requestQueue = Promise.resolve();
let nextRequestAt = 0;

async function schedule<T>(intervalMs: number, task: () => Promise<T>) {
  const run = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRequestAt = Date.now() + intervalMs;
    return task();
  });
  requestQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function resolveZapCatalogUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  const base = new URL(baseUrl);
  const disallowed =
    url.search.length > 0 ||
    url.pathname.includes("/search") ||
    !url.pathname.startsWith("/carparts");
  if (
    url.protocol !== "https:" ||
    url.hostname !== base.hostname ||
    disallowed
  ) {
    throw new AdapterError(
      "zap",
      "unsupported-query",
      "ROBOTS_DISALLOWED: разрешены только публичные SSR-страницы /carparts без query parameters",
    );
  }
  return url.toString();
}

function isBlockPage(html: string): boolean {
  return /captcha|слишком много запросов|too many requests|access denied/i.test(
    html,
  );
}

export function createZapPageLoader(
  options: ZapLoaderOptions = {},
): ZapPageLoader {
  const config = options.config ?? readZapTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));

  return (path) =>
    schedule(config.ZAP_REQUEST_INTERVAL_MS, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.ZAP_HTTP_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(
          resolveZapCatalogUrl(config.ZAP_BASE_URL, path),
          {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": config.ZAP_USER_AGENT,
            },
            redirect: "error",
            signal: controller.signal,
          },
        );
        const html = await response.text();
        if (response.status === 429 || isBlockPage(html)) {
          throw new AdapterError(
            "zap",
            "rate-limited",
            "HTTP_BLOCKED: Zap.by ограничил частоту запросов",
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AdapterError(
            "zap",
            "blocked",
            `HTTP_BLOCKED: Zap.by вернул HTTP ${response.status}`,
          );
        }
        if (!response.ok) {
          throw new AdapterError(
            "zap",
            "network",
            `HTTP_BLOCKED: Zap.by вернул HTTP ${response.status}`,
          );
        }
        return {
          html,
          path: new URL(response.url || path, config.ZAP_BASE_URL).pathname,
          status: response.status,
        };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "zap",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: Zap.by не ответил вовремя"
            : "HTTP_BLOCKED: не удалось загрузить Zap.by",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
}

let defaultLoader: ZapPageLoader | undefined;

export function loadZapPageHtml(path: string): Promise<LoadedZapHtml> {
  defaultLoader ??= createZapPageLoader();
  return defaultLoader(path);
}
