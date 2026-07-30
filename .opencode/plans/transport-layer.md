# transport/ — shared HTTP layer

## Files to create

### `actors/search/src/transport/headers.ts`
Browser-like headers builder for each request. Picks a random User-Agent from a pool of real browser UAs on each invocation and generates matching Sec-CH-UA / Sec-Fetch-* headers.

### `actors/search/src/transport/scheduler.ts`
Per-source request queue with rate limiting (extracted from the duplicate code in each loader.ts). Exported `schedule(sourceId, intervalMs, operation)`.

### `actors/search/src/transport/blocked.ts`
Unified blocking detection: Cloudflare Turnstile, DDoS-Guard, Belarusian captcha pages, navigator.webdriver, 429/403, rate limit messages. Returns `{ blocked: true/false, code, reason }`.

### `actors/search/src/transport/metrics.ts`
Per-source counters (requests, retries, blocks, timeouts, errors). Exported `logTransportSummary()` for Vercel logs.

### `actors/search/src/transport/client.ts`
Main HTTP client (`createHttpClient(config)`). Features:
- Random UA + realistic headers per request
- `redirect: "manual"` (do not follow redirects silently)
- AbortController timeout
- `fetchHtml(url)` and `fetchJson(url)` methods
- Auto-retry on block/timeout/rate-limit with exponential backoff
- Per-source rate limiting via scheduler
- Console.info logging at each step

### `actors/search/src/transport/index.ts`
Re-exports everything.

---

## Files to modify

### `actors/search/src/adapters/motorland/loader.ts`
Replace duplicate code with:
```ts
const http = createHttpClient({
  sourceId: "motorland",
  baseUrl: config.MOTORLAND_BASE_URL,
  timeoutMs: config.MOTORLAND_HTTP_TIMEOUT_MS,
  intervalMs: config.MOTORLAND_REQUEST_INTERVAL_MS,
});

return (query: string) => {
  const url = new URL("/auto-parts/", config.MOTORLAND_BASE_URL);
  url.searchParams.set("Filter.TextSearch", query);
  return http.fetchHtml(url.toString());
};
```

### `actors/search/src/adapters/motorland/config.ts`
Change default UA from bot to:
```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36
```

### `actors/search/src/adapters/auto1/loader.ts`
Same pattern — replace with `createHttpClient`.

### `actors/search/src/adapters/auto1/config.ts`
Change default UA.

### `actors/search/src/adapters/remzona/loader.ts`
Replace HTML/XHR loaders with `createHttpClient`. Keep Playwright fallback (`loadRemzonaPlaywrightHtml`) unchanged but make it use realistic UA too.

### `actors/search/src/adapters/remzona/config.ts`
Change default UA.

### `actors/search/src/adapters/zap/loader.ts`
Replace `createZapClient` internals with `createHttpClient`. Keep:
- Cookie management for session persistence
- `resolveZapCatalogUrl` / `resolveZapJsonUrl` URL validation
- Referrer-based headers for JSON API

### `actors/search/src/adapters/zap/config.ts`
Change default UA, remove `.transform` clamping timeout to 15s (allow smaller values for Vercel hobby).

### `actors/search/src/adapters/armtek/loader.ts`
Replace direct fetch with `createHttpClient`. Keep guest auth flow (token acquisition before search).

### `actors/search/src/adapters/armtek/config.ts`
Change default UA.

### Create `/Users/egorselivanov/Downloads/AutoRadar/vercel.json`
```json
{
  "functions": {
    "apps/web/**/*.ts": {
      "regions": ["fra1"]
    }
  }
}
```

---

## Source code for each new file

### `actors/search/src/transport/headers.ts`
```typescript
export const DESKTOP_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/129.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/129.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
];

function pickUserAgent(): string {
  return DESKTOP_USER_AGENTS[Math.floor(Math.random() * DESKTOP_USER_AGENTS.length)];
}

export interface BrowserHeaders {
  accept: string;
  "accept-language": string;
  "user-agent": string;
  "sec-ch-ua"?: string;
  "sec-ch-ua-mobile"?: string;
  "sec-ch-ua-platform"?: string;
  "sec-fetch-dest": string;
  "sec-fetch-mode": string;
  "sec-fetch-site": string;
}

export function buildHtmlHeaders(uaOverride?: string): BrowserHeaders {
  const ua = uaOverride ?? pickUserAgent();
  const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
  const headers: BrowserHeaders = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": ua,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  };
  if (isChrome) {
    headers["sec-ch-ua"] = '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"';
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = '"macOS"';
  }
  return headers;
}

export function buildJsonHeaders(uaOverride?: string): BrowserHeaders {
  const ua = uaOverride ?? pickUserAgent();
  const headers: BrowserHeaders = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": ua,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
    headers["sec-ch-ua"] = '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"';
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = '"macOS"';
  }
  return headers;
}
```

### `actors/search/src/transport/scheduler.ts`
```typescript
const queues = new Map<string, Promise<void>>();
const nextRequestAt = new Map<string, number>();

export async function schedule<T>(
  sourceId: string,
  intervalMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  if (!queues.has(sourceId)) {
    queues.set(sourceId, Promise.resolve());
    nextRequestAt.set(sourceId, 0);
  }
  const queue = queues.get(sourceId)!;
  const scheduled = queue.then(async () => {
    const waitMs = Math.max(0, (nextRequestAt.get(sourceId) ?? 0) - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRequestAt.set(sourceId, Date.now() + intervalMs);
    return operation();
  });
  queues.set(sourceId, scheduled.then(() => undefined, () => undefined));
  return scheduled;
}

export function resetScheduler(): void {
  queues.clear();
  nextRequestAt.clear();
}
```

### `actors/search/src/transport/blocked.ts`
```typescript
export interface BlockResult {
  blocked: true;
  code: "rate-limited" | "blocked";
  reason: string;
}
export interface NotBlocked {
  blocked: false;
}
export type BlockCheck = BlockResult | NotBlocked;

const BLOCK_PATTERNS: { regex: RegExp; code: "rate-limited" | "blocked"; reason: string }[] = [
  { regex: /<title>[^<]*(?:captcha|access denied|http error 429|403 forbidden|доступ ограничен)/i, code: "blocked", reason: "CAPTCHA or access denied in <title>" },
  { regex: /(?:class|id)=["'][^"']*(?:captcha|challenge|turnstile)[^"']*["']/i, code: "blocked", reason: "CAPTCHA/challenge element found" },
  { regex: /cf-challenge|challenge-platform|cdn-cgi\/challenge/i, code: "blocked", reason: "Cloudflare challenge page" },
  { regex: /challenges\.cloudflare\.com\/turnstile/i, code: "blocked", reason: "Cloudflare Turnstile" },
  { regex: /ddos-guard|Доступ ограничен|Ваш IP заблокирован/i, code: "blocked", reason: "DDoS-Guard protection" },
  { regex: /navigator\.webdriver|webdriver\b|__webdriver/i, code: "blocked", reason: "Bot detection triggered" },
  { regex: /слишком много запросов|too many requests|превышен лимит/i, code: "rate-limited", reason: "Rate limit message" },
  { regex: /<h2>\s*429\s*<\/h2>/i, code: "rate-limited", reason: "HTTP 429 page" },
  { regex: /hg-security|kaspersky.*security|bitrix.*captcha/i, code: "blocked", reason: "Security page" },
  { regex: /document\.(?:createElement|write|cookie).*challenge/i, code: "blocked", reason: "JS challenge" },
];

export function detectBlock(html: string, status: number): BlockCheck {
  if (status === 429) return { blocked: true, code: "rate-limited", reason: "HTTP 429 Too Many Requests" };
  if (status === 403) return { blocked: true, code: "blocked", reason: "HTTP 403 Forbidden" };
  if (status === 401) return { blocked: true, code: "blocked", reason: "HTTP 401 Unauthorized" };
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.regex.test(html)) {
      return { blocked: true, code: pattern.code, reason: pattern.reason };
    }
  }
  return { blocked: false };
}
```

### `actors/search/src/transport/metrics.ts`
```typescript
export interface TransportMetrics {
  requests: number;
  retries: number;
  blocks: number;
  timeouts: number;
  errors: number;
}

const allMetrics = new Map<string, TransportMetrics>();

export function updateTransportMetrics(sourceId: string, metrics: TransportMetrics): void {
  allMetrics.set(sourceId, metrics);
}

export function getTransportMetrics(): Record<string, TransportMetrics> {
  const result: Record<string, TransportMetrics> = {};
  for (const [key, value] of allMetrics) {
    result[key] = { ...value };
  }
  return result;
}

export function logTransportSummary(): void {
  for (const [sourceId, m] of Object.entries(getTransportMetrics())) {
    console.info(
      `[${sourceId}] transport: ${m.requests} req, ${m.retries} retry, ${m.blocks} block, ${m.timeouts} timeout, ${m.errors} err`,
    );
  }
}
```

### `actors/search/src/transport/client.ts`
```typescript
import { AdapterError } from "../adapters/types";
import { detectBlock } from "./blocked";
import { buildHtmlHeaders, buildJsonHeaders, type BrowserHeaders } from "./headers";
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

export interface FetchHtmlResult { html: string; status: number; url: string }
export interface FetchJsonResult { data: unknown; status: number }

export interface HttpClient {
  readonly sourceId: string;
  fetchHtml(url: string, options?: Partial<{
    searchParams: Record<string, string>;
    headers: Record<string, string>;
    uaOverride: string;
    method: "GET" | "POST";
    body: string | URLSearchParams;
    referrer: string;
  }>): Promise<FetchHtmlResult>;
  fetchJson(url: string, options?: Partial<{
    searchParams: Record<string, string>;
    headers: Record<string, string>;
    uaOverride: string;
    method: "GET" | "POST";
    body: string;
    referrer: string;
  }>): Promise<FetchJsonResult>;
  getMetrics(): TransportMetrics;
}

export function createHttpClient(config: HttpTransportConfig): HttpClient {
  const { sourceId, baseUrl } = config;
  const maxRetries = config.maxRetries ?? 2;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let metrics: TransportMetrics = { requests: 0, retries: 0, blocks: 0, timeouts: 0, errors: 0 };

  function track(partial: Partial<TransportMetrics>): void {
    metrics = { ...metrics, ...partial };
    updateTransportMetrics(sourceId, metrics);
  }

  async function attemptHtml(url: string, ua: string, opts?: {
    headers?: Record<string, string>; method?: "GET" | "POST";
    body?: string | URLSearchParams; referrer?: string;
  }): Promise<FetchHtmlResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const hdrs: Record<string, string> = { ...buildHtmlHeaders(ua) };
      if (opts?.referrer) hdrs.referer = new URL(opts.referrer, baseUrl).toString();
      if (opts?.headers) Object.assign(hdrs, opts.headers);
      const init: RequestInit = { headers: hdrs, redirect: "manual", signal: controller.signal };
      if (opts?.method === "POST") { init.method = "POST"; init.body = opts.body; }
      console.info(`[${sourceId}] GET ${url.slice(0, 120)}`);
      const res = await fetchImpl(url, init);
      const resolvedUrl = res.url || url;
      const html = await res.text().catch(() => "");
      const block = detectBlock(html, res.status);
      if (block.blocked) {
        track({ blocks: metrics.blocks + 1 });
        console.warn(`[${sourceId}] BLOCKED: ${block.reason} (HTTP ${res.status})`);
        throw new AdapterError(sourceId, block.code, `HTTP_BLOCKED: ${block.reason}`);
      }
      if (!res.ok) {
        track({ errors: metrics.errors + 1 });
        throw new AdapterError(sourceId, "network", `${sourceId} вернул HTTP ${res.status}`);
      }
      console.info(`[${sourceId}] OK (${html.length}B)`);
      return { html, status: res.status, url: resolvedUrl };
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      const timedOut = err instanceof Error && err.name === "AbortError";
      track(timedOut ? { timeouts: metrics.timeouts + 1 } : { errors: metrics.errors + 1 });
      throw new AdapterError(sourceId, timedOut ? "timeout" : "network",
        timedOut ? `${sourceId} не ответил за ${config.timeoutMs}мс` : `${sourceId} — ошибка сети`,
        { cause: err });
    } finally { clearTimeout(timer); }
  }

  async function attemptJson(url: string, ua: string, opts?: {
    headers?: Record<string, string>; method?: "GET" | "POST";
    body?: string; referrer?: string;
  }): Promise<FetchJsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const hdrs: Record<string, string> = { ...buildJsonHeaders(ua) };
      if (opts?.referrer) hdrs.referer = new URL(opts.referrer, baseUrl).toString();
      if (opts?.headers) Object.assign(hdrs, opts.headers);
      const init: RequestInit = { headers: hdrs, redirect: "manual", signal: controller.signal };
      if (opts?.method === "POST") { init.method = "POST"; init.body = opts.body; }
      console.info(`[${sourceId}] JSON ${url.slice(0, 120)}`);
      const res = await fetchImpl(url, init);
      const text = await res.text();
      const block = detectBlock(text, res.status);
      if (block.blocked) {
        track({ blocks: metrics.blocks + 1 });
        throw new AdapterError(sourceId, block.code, `HTTP_BLOCKED: ${block.reason}`);
      }
      if (!res.ok) {
        track({ errors: metrics.errors + 1 });
        throw new AdapterError(sourceId,
          res.status === 401 || res.status === 403 ? "blocked" : "network",
          `${sourceId} вернул HTTP ${res.status}`);
      }
      let data: unknown;
      try { data = JSON.parse(text) as unknown; } catch {
        throw new AdapterError(sourceId, "parse", `${sourceId} вернул невалидный JSON`);
      }
      console.info(`[${sourceId}] JSON OK`);
      return { data, status: res.status };
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      const timedOut = err instanceof Error && err.name === "AbortError";
      throw new AdapterError(sourceId, timedOut ? "timeout" : "network",
        timedOut ? `${sourceId} не ответил за ${config.timeoutMs}мс` : `${sourceId} — ошибка сети`,
        { cause: err });
    } finally { clearTimeout(timer); }
  }

  async function fetchHtml(url: string, opts?: Parameters<HttpClient["fetchHtml"]>[1]): Promise<FetchHtmlResult> {
    track({ requests: metrics.requests + 1 });
    for (let attempt = 0; attempt <= Math.min(maxRetries, 3); attempt++) {
      try {
        return await schedule(sourceId, config.intervalMs, () => attemptHtml(url, opts?.uaOverride ?? "", opts));
      } catch (err) {
        if (!(err instanceof AdapterError)) throw err;
        if (err.code === "timeout" && attempt < 1) {
          track({ retries: metrics.retries + 1 });
          console.warn(`[${sourceId}] RETRY timeout (${attempt + 1})`);
          continue;
        }
        if ((err.code === "blocked" || err.code === "rate-limited") && attempt < maxRetries) {
          track({ retries: metrics.retries + 1 });
          console.warn(`[${sourceId}] RETRY block (${attempt + 1})`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new AdapterError(sourceId, "network", `${sourceId} — все попытки исчерпаны`);
  }

  async function fetchJson(url: string, opts?: Parameters<HttpClient["fetchJson"]>[1]): Promise<FetchJsonResult> {
    track({ requests: metrics.requests + 1 });
    for (let attempt = 0; attempt <= Math.min(maxRetries, 2); attempt++) {
      try {
        return await schedule(sourceId, config.intervalMs, () => attemptJson(url, opts?.uaOverride ?? "", opts));
      } catch (err) {
        if (!(err instanceof AdapterError)) throw err;
        if (err.code === "blocked" && attempt < maxRetries) {
          track({ retries: metrics.retries + 1 });
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new AdapterError(sourceId, "network", `${sourceId} — все попытки исчерпаны`);
  }

  return { sourceId, fetchHtml, fetchJson, getMetrics: () => ({ ...metrics }) };
}
```

### `actors/search/src/transport/index.ts`
```typescript
export { createHttpClient } from "./client";
export type { HttpClient, HttpTransportConfig, FetchHtmlResult, FetchJsonResult } from "./client";
export { detectBlock } from "./blocked";
export type { BlockCheck, BlockResult } from "./blocked";
export { buildHtmlHeaders, buildJsonHeaders } from "./headers";
export { DESKTOP_USER_AGENTS } from "./headers";
export type { BrowserHeaders } from "./headers";
export { schedule, resetScheduler } from "./scheduler";
export { getTransportMetrics, logTransportSummary } from "./metrics";
export type { TransportMetrics } from "./metrics";
```

---

## Changes to existing files

### `motorland/config.ts`
- Default `MOTORLAND_USER_AGENT`: change from bot to `"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"`

### `motorland/loader.ts`
- Remove local `requestQueue`, `nextRequestAt`, `wait`, `schedule`, `isBlockedPage`
- Import `createHttpClient` from `../transport`
- `createMotorlandSearchLoader` uses `createHttpClient({...})` then calls `http.fetchHtml(url)`
- `redirect: "error"` → `redirect: "manual"`

### `auto1/config.ts`
- Change default UA to browser

### `auto1/loader.ts`
- Same pattern as motorland — remove duplicate code, use `createHttpClient`

### `remzona/config.ts`
- Change default UA to browser

### `remzona/loader.ts`
- Remove local `requestQueue`, `nextRequestAt`, `wait`, `schedule`, `isRateLimitPage`, `parseRetryAfter`
- `createRemzonaHtmlLoader` and `createRemzonaPageLoader` use `createHttpClient`
- Keep `loadRemzonaPlaywrightHtml` but update its UA

### `zap/config.ts`
- Change default UA to browser
- Remove `.transform((value) => Math.max(value, 15_000))` — allow smaller timeout

### `zap/loader.ts`
- Remove local `requestQueue`, `nextRequestAt`, `schedule`, `isBlockPage`
- `createZapClient` uses `createHttpClient` internally
- Keep cookie management (`rememberCookies`, `requestHeaders` with cookie)
- Keep `resolveZapCatalogUrl`, `resolveZapJsonUrl`
- Keep `loadPageHtml` and `loadJson` methods but delegate HTTP to transport

### `armtek/config.ts`
- Change default UA to browser

### `armtek/loader.ts`
- Remove local `requestQueue`, `nextRequestAt`, `schedule`
- Use `createHttpClient` for API calls
- Keep guest auth flow (token acquisition)

### `vercel.json` (new file in project root)
```json
{
  "functions": {
    "apps/web/**/*.ts": {
      "regions": ["fra1"]
    }
  }
}
```

---

## Verification

After all changes:
1. `pnpm typecheck` — no type errors
2. `pnpm lint` — no lint errors
3. `pnpm build` — builds cleanly
4. `pnpm test` — existing tests pass (federated-search, request-normalizer, part-synonyms, etc.)
5. Adapter-specific smoke tests if available
