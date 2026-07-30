import { AdapterError } from "../adapters/types";
import { detectBlock } from "./blocked";
import { buildHtmlHeaders, buildJsonHeaders } from "./headers";
import { schedule } from "./scheduler";
import { updateTransportMetrics, type TransportMetrics } from "./metrics";

export interface HttpTransportConfig {
  sourceId: string;
  baseUrl: string;
  timeoutMs: number;
  intervalMs: number;
  maxRetries?: number;
  fetchImpl?: typeof globalThis.fetch;
}

export interface FetchHtmlResult {
  html: string;
  status: number;
  url: string;
}

export interface FetchJsonResult {
  data: unknown;
  status: number;
}

export interface HttpClient {
  readonly sourceId: string;
  fetchHtml(
    url: string,
    options?: Partial<{
      searchParams: Record<string, string>;
      headers: Record<string, string>;
      uaOverride: string;
      method: "GET" | "POST";
      body: string | URLSearchParams;
      referrer: string;
    }>,
  ): Promise<FetchHtmlResult>;

  fetchJson(
    url: string,
    options?: Partial<{
      searchParams: Record<string, string>;
      headers: Record<string, string>;
      uaOverride: string;
      method: "GET" | "POST";
      body: string;
      referrer: string;
    }>,
  ): Promise<FetchJsonResult>;

  getMetrics(): TransportMetrics;
}

export function createHttpClient(config: HttpTransportConfig): HttpClient {
  const sourceId = config.sourceId;
  const maxRetries = config.maxRetries ?? 2;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let metrics: TransportMetrics = {
    requests: 0,
    retries: 0,
    blocks: 0,
    timeouts: 0,
    errors: 0,
  };

  function track(partial: Partial<TransportMetrics>): void {
    metrics = { ...metrics, ...partial };
    updateTransportMetrics(sourceId, metrics);
  }

  async function attemptHtml(
    url: string,
    userAgent: string,
    options?: {
      headers?: Record<string, string>;
      method?: "GET" | "POST";
      body?: string | URLSearchParams;
      referrer?: string;
    },
  ): Promise<FetchHtmlResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const baseHeaders = buildHtmlHeaders(userAgent);
      const mergedHeaders: Record<string, string> = { ...baseHeaders };

      if (options?.referrer) {
        mergedHeaders.referer = new URL(options.referrer, config.baseUrl).toString();
      }
      if (options?.headers) {
        Object.assign(mergedHeaders, options.headers);
      }

      const fetchInit: RequestInit = {
        headers: mergedHeaders,
        redirect: "manual",
        signal: controller.signal,
      };

      if (options?.method === "POST") {
        fetchInit.method = "POST";
        fetchInit.body = options.body;
      }

      console.info(`[${sourceId}] GET ${url.slice(0, 120)}`);

      const response = await fetchImpl(url, fetchInit);

      const resolvedUrl = response.url || url;
      let html: string;
      try {
        html = await response.text();
      } catch {
        html = "";
      }

      const block = detectBlock(html, response.status);
      if (block.blocked) {
        track({ blocks: metrics.blocks + 1 });
        console.warn(`[${sourceId}] BLOCKED: ${block.reason}`);
        throw new AdapterError(sourceId, block.code, `HTTP_BLOCKED: ${block.reason}`);
      }

      if (!response.ok) {
        track({ errors: metrics.errors + 1 });
        throw new AdapterError(
          sourceId,
          "network",
          `HTTP_BLOCKED: ${sourceId} вернул HTTP ${response.status}`,
        );
      }

      console.info(`[${sourceId}] OK (${html.length}B)`);
      return { html, status: response.status, url: resolvedUrl };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const timedOut = error instanceof Error && error.name === "AbortError";
      if (timedOut) {
        track({ timeouts: metrics.timeouts + 1 });
      } else {
        track({ errors: metrics.errors + 1 });
      }
      throw new AdapterError(
        sourceId,
        timedOut ? "timeout" : "network",
        timedOut
          ? `TIMEOUT: ${sourceId} не ответил за ${config.timeoutMs}мс`
          : `HTTP_BLOCKED: ${sourceId} — ошибка сети`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function attemptJson(
    url: string,
    userAgent: string,
    options?: {
      headers?: Record<string, string>;
      method?: "GET" | "POST";
      body?: string;
      referrer?: string;
    },
  ): Promise<FetchJsonResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const baseHeaders = buildJsonHeaders(userAgent);
      const mergedHeaders: Record<string, string> = { ...baseHeaders };

      if (options?.referrer) {
        mergedHeaders.referer = new URL(options.referrer, config.baseUrl).toString();
      }
      if (options?.headers) {
        Object.assign(mergedHeaders, options.headers);
      }

      const fetchInit: RequestInit = {
        headers: mergedHeaders,
        redirect: "manual",
        signal: controller.signal,
      };

      if (options?.method === "POST") {
        fetchInit.method = "POST";
        fetchInit.body = options.body;
      }

      console.info(`[${sourceId}] JSON ${url.slice(0, 120)}`);

      const response = await fetchImpl(url, fetchInit);
      const text = await response.text();

      const block = detectBlock(text, response.status);
      if (block.blocked) {
        track({ blocks: metrics.blocks + 1 });
        console.warn(`[${sourceId}] BLOCKED: ${block.reason}`);
        throw new AdapterError(sourceId, block.code, `HTTP_BLOCKED: ${block.reason}`);
      }
      if (!response.ok) {
        track({ errors: metrics.errors + 1 });
        throw new AdapterError(
          sourceId,
          response.status === 401 || response.status === 403 ? "blocked" : "network",
          `HTTP_BLOCKED: ${sourceId} вернул HTTP ${response.status}`,
        );
      }

      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        throw new AdapterError(sourceId, "parse", `${sourceId} вернул невалидный JSON`);
      }

      console.info(`[${sourceId}] JSON OK`);
      return { data, status: response.status };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const timedOut = error instanceof Error && error.name === "AbortError";
      if (timedOut) {
        track({ timeouts: metrics.timeouts + 1 });
      }
      throw new AdapterError(
        sourceId,
        timedOut ? "timeout" : "network",
        timedOut
          ? `TIMEOUT: ${sourceId} не ответил за ${config.timeoutMs}мс`
          : `HTTP_BLOCKED: ${sourceId} — ошибка сети`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchHtml(
    url: string,
    options?: Parameters<HttpClient["fetchHtml"]>[1],
  ): Promise<FetchHtmlResult> {
    track({ requests: metrics.requests + 1 });

    for (let attempt = 0; attempt <= Math.min(maxRetries, 3); attempt++) {
      try {
        return await schedule(sourceId, config.intervalMs, () =>
          attemptHtml(url, options?.uaOverride ?? "", options),
        );
      } catch (error) {
        if (!(error instanceof AdapterError)) throw error;

        if (error.code === "timeout" && attempt < 1) {
          track({ retries: metrics.retries + 1 });
          console.warn(`[${sourceId}] RETRY after timeout (attempt ${attempt + 1})`);
          continue;
        }

        if ((error.code === "blocked" || error.code === "rate-limited") && attempt < maxRetries) {
          track({ retries: metrics.retries + 1 });
          console.warn(`[${sourceId}] RETRY with different UA (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        throw error;
      }
    }

    throw new AdapterError(sourceId, "network", `${sourceId} — все попытки исчерпаны`);
  }

  async function fetchJson(
    url: string,
    options?: Parameters<HttpClient["fetchJson"]>[1],
  ): Promise<FetchJsonResult> {
    track({ requests: metrics.requests + 1 });

    for (let attempt = 0; attempt <= Math.min(maxRetries, 2); attempt++) {
      try {
        return await schedule(sourceId, config.intervalMs, () =>
          attemptJson(url, options?.uaOverride ?? "", options),
        );
      } catch (error) {
        if (!(error instanceof AdapterError)) throw error;
        if (error.code === "blocked" && attempt < maxRetries) {
          track({ retries: metrics.retries + 1 });
          console.warn(`[${sourceId}] RETRY JSON (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }

    throw new AdapterError(sourceId, "network", `${sourceId} — все попытки исчерпаны`);
  }

  return {
    sourceId,
    fetchHtml,
    fetchJson,
    getMetrics: () => ({ ...metrics }),
  };
}
