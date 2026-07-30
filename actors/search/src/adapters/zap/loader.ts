import { AdapterError } from "../types";
import { readZapTransportConfig, type ZapTransportConfig } from "./config";

export interface LoadedZapHtml {
  html: string;
  path: string;
  status: number;
}

export type ZapPageLoader = (path: string) => Promise<LoadedZapHtml>;
export type ZapJsonLoader = (
  path: string,
  params: Record<string, string | number>,
  referrer?: string,
) => Promise<unknown>;

export interface ZapClient {
  loadPageHtml: ZapPageLoader;
  loadJson: ZapJsonLoader;
}

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

export function resolveZapCatalogUrl(
  baseUrl: string,
  path: string,
): string {
  const url = new URL(path, baseUrl);
  const base = new URL(baseUrl);
  const isPublicCatalog = /^\/carparts(?:\/[^?#]*)?$/.test(url.pathname);
  const isPublicProduct = /^\/[^/]+\/[^/]+$/.test(url.pathname);
  const allowedQuery = [...url.searchParams.keys()].every((key) =>
    ["page", "infinite"].includes(key),
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== base.hostname ||
    (!isPublicCatalog && !isPublicProduct) ||
    !allowedQuery
  ) {
    throw new AdapterError(
      "zap",
      "unsupported-query",
      "ROBOTS_DISALLOWED: адаптер использует только подтверждённые публичные страницы каталога и товаров Zap.by",
    );
  }
  return url.toString();
}

function resolveZapJsonUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(path, baseUrl);
  const base = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== base.hostname ||
    url.pathname !== "/index.php"
  ) {
    throw new AdapterError(
      "zap",
      "unsupported-query",
      "ROBOTS_DISALLOWED: endpoint Zap.by не разрешён конфигурацией адаптера",
    );
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  if (
    url.pathname === "/index.php" &&
    url.searchParams.get("route") !== "catalog/parts/choice3d"
  ) {
    throw new AdapterError(
      "zap",
      "unsupported-query",
      "ROBOTS_DISALLOWED: разрешён только vehicle picker Zap.by",
    );
  }
  return url.toString();
}

function isBlockPage(html: string): boolean {
  return /captcha|слишком много запросов|too many requests|access denied/i.test(
    html,
  );
}

export function createZapClient(options: ZapLoaderOptions = {}): ZapClient {
  const config = options.config ?? readZapTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));
  const cookies = new Map<string, string>();

  function rememberCookies(headers: Headers) {
    const values =
      (
        headers as Headers & {
          getSetCookie?: () => string[];
        }
      ).getSetCookie?.() ?? [];
    for (const header of values) {
      const pair = header.split(";", 1)[0];
      if (!pair) {
        continue;
      }
      const separator = pair.indexOf("=");
      if (separator > 0) {
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  function requestHeaders(referrer?: string): HeadersInit {
    const headers: Record<string, string> = {
      accept: "text/html,application/xhtml+xml",
      "user-agent": config.ZAP_USER_AGENT,
    };
    if (cookies.size > 0) {
      headers.cookie = [...cookies]
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    }
    if (referrer) {
      headers.referer = new URL(referrer, config.ZAP_BASE_URL).toString();
      headers["x-requested-with"] = "XMLHttpRequest";
      headers.accept = "application/json, text/javascript, */*; q=0.01";
    }
    return headers;
  }

  const loadPageHtml: ZapPageLoader = (path) =>
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
            headers: requestHeaders(),
            redirect: "error",
            signal: controller.signal,
          },
        );
        rememberCookies(response.headers);
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

  const loadJson: ZapJsonLoader = (path, params, referrer) =>
    schedule(config.ZAP_REQUEST_INTERVAL_MS, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.ZAP_HTTP_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(
          resolveZapJsonUrl(
            config.ZAP_BASE_URL,
            path,
            params,
          ),
          {
            headers: requestHeaders(referrer),
            redirect: "error",
            signal: controller.signal,
          },
        );
        rememberCookies(response.headers);
        const text = await response.text();
        if (response.status === 429 || isBlockPage(text)) {
          throw new AdapterError(
            "zap",
            "rate-limited",
            "HTTP_BLOCKED: Zap.by ограничил частоту запросов",
          );
        }
        if (!response.ok) {
          throw new AdapterError(
            "zap",
            response.status === 401 || response.status === 403
              ? "blocked"
              : "network",
            `HTTP_BLOCKED: Zap.by вернул HTTP ${response.status}`,
          );
        }
        try {
          return JSON.parse(text) as unknown;
        } catch (error) {
          throw new AdapterError(
            "zap",
            "parse",
            "DOM_CHANGED: Zap.by вернул невалидный JSON",
            { cause: error },
          );
        }
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

  return { loadPageHtml, loadJson };
}

export function createZapPageLoader(
  options: ZapLoaderOptions = {},
): ZapPageLoader {
  return createZapClient(options).loadPageHtml;
}

let defaultClient: ZapClient | undefined;

function getDefaultClient(): ZapClient {
  defaultClient ??= createZapClient();
  return defaultClient;
}

export function loadZapPageHtml(path: string): Promise<LoadedZapHtml> {
  return getDefaultClient().loadPageHtml(path);
}

export function loadZapJson(
  path: string,
  params: Record<string, string | number>,
  referrer?: string,
): Promise<unknown> {
  return getDefaultClient().loadJson(path, params, referrer);
}
