import { AdapterError } from "../types";
import {
  readDavinagazTransportConfig,
  type DavinagazTransportConfig,
} from "./config";

export interface LoadedDavinagazHtml {
  html: string;
  status: number;
  url: string;
  method: "html" | "playwright";
}

interface DavinagazLoaderOptions {
  config?: DavinagazTransportConfig;
  fetchImpl?: typeof globalThis.fetch;
  playwrightLoader?: DavinagazPlaywrightLoader;
}

export type DavinagazPlaywrightLoader = (
  url: string,
  config: DavinagazTransportConfig,
) => Promise<LoadedDavinagazHtml>;

let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let stealthRegistered = false;

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

function isAllowedSearchUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname === "davinagaz.by" &&
    url.pathname.startsWith("/search/")
  );
}

function isChallengeHtml(html: string): boolean {
  return /<title>\s*(?:Just a moment\.\.\.|Один момент…)\s*<\/title>|\/cdn-cgi\/challenge-platform\/|enable javascript and cookies to continue|Выполнение проверки безопасности/i.test(
    html,
  );
}

function isChallenge(response: Response, html: string): boolean {
  return (
    response.headers.get("cf-mitigated") === "challenge" ||
    isChallengeHtml(html)
  );
}

export async function loadDavinagazPlaywrightHtml(
  url: string,
  config: DavinagazTransportConfig = readDavinagazTransportConfig(),
): Promise<LoadedDavinagazHtml> {
  const target = new URL(url);
  if (!isAllowedSearchUrl(target)) {
    throw new AdapterError(
      "davinagaz",
      "unsupported-query",
      "DOM_CHANGED: Playwright получил URL вне публичного поиска Davinagaz.by",
    );
  }

  const [{ chromium }, { default: StealthPlugin }] = await Promise.all([
    import("playwright-extra"),
    import("puppeteer-extra-plugin-stealth"),
  ]);
  if (!stealthRegistered) {
    chromium.use(StealthPlugin());
    stealthRegistered = true;
  }
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      locale: "ru-BY",
      timezoneId: "Europe/Minsk",
      viewport: { width: 1365, height: 768 },
    });
    const page = await context.newPage();
    const response = await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: config.DAVINAGAZ_PLAYWRIGHT_TIMEOUT_MS,
    });

    try {
      await page.waitForFunction(
        () => {
          const html = document.documentElement.outerHTML;
          const challenge =
            ["Just a moment...", "Один момент…"].includes(
              document.title.trim(),
            ) ||
            html.includes("/cdn-cgi/challenge-platform/") ||
            /enable javascript and cookies to continue|Выполнение проверки безопасности/i.test(
              html,
            );
          const pending = document.querySelector(".is-finder-proccess");
          return !challenge && !pending;
        },
        undefined,
        { timeout: config.DAVINAGAZ_PLAYWRIGHT_TIMEOUT_MS },
      );
    } catch (error) {
      if (isChallengeHtml(await page.content())) {
        throw new AdapterError(
          "davinagaz",
          "blocked",
          "HTTP_BLOCKED: Cloudflare не пропустил разрешённую Playwright-сессию Davinagaz.by",
          { cause: error },
        );
      }
      throw error;
    }

    const html = await page.content();
    if (isChallengeHtml(html)) {
      throw new AdapterError(
        "davinagaz",
        "blocked",
        "HTTP_BLOCKED: Playwright не прошёл разрешённый Cloudflare challenge Davinagaz.by",
      );
    }
    return {
      html,
      status: response?.status() ?? 200,
      url: page.url(),
      method: "playwright",
    };
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    throw new AdapterError(
      "davinagaz",
      "timeout",
      "TIMEOUT: Playwright не дождался результатов Davinagaz.by",
      { cause: error },
    );
  } finally {
    await browser.close();
  }
}

export function createDavinagazSearchLoader(
  options: DavinagazLoaderOptions = {},
): (article: string) => Promise<LoadedDavinagazHtml> {
  const config = options.config ?? readDavinagazTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));
  const playwrightLoader =
    options.playwrightLoader ?? loadDavinagazPlaywrightHtml;

  return (article) =>
    schedule(config.DAVINAGAZ_REQUEST_INTERVAL_MS, async () => {
      const baseUrl = new URL(config.DAVINAGAZ_BASE_URL);
      const initialUrl = new URL("/search/number/", baseUrl);
      if (!isAllowedSearchUrl(initialUrl)) {
        throw new AdapterError(
          "davinagaz",
          "unsupported-query",
          "DOM_CHANGED: разрешён только публичный HTTPS-поиск davinagaz.by",
        );
      }
      initialUrl.searchParams.set("article", article);

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.DAVINAGAZ_HTTP_TIMEOUT_MS,
      );
      try {
        let url = initialUrl;
        for (let redirect = 0; redirect <= 3; redirect += 1) {
          const response = await fetchImpl(url, {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": config.DAVINAGAZ_USER_AGENT,
            },
            redirect: "manual",
            signal: controller.signal,
          });
          const html = await response.text();
          if (isChallenge(response, html)) {
            if (config.DAVINAGAZ_PLAYWRIGHT_FALLBACK_ENABLED) {
              return playwrightLoader(url.toString(), config);
            }
            throw new AdapterError(
              "davinagaz",
              "blocked",
              "HTTP_BLOCKED: Davinagaz.by требует Cloudflare browser challenge",
            );
          }
          if (response.status === 429) {
            throw new AdapterError(
              "davinagaz",
              "rate-limited",
              "HTTP_BLOCKED: Davinagaz.by временно ограничил публичный поиск",
            );
          }
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            if (!location || redirect === 3) {
              throw new AdapterError(
                "davinagaz",
                "network",
                "HTTP_BLOCKED: Davinagaz.by вернул некорректное перенаправление",
              );
            }
            const redirectedUrl = new URL(location, url);
            if (!isAllowedSearchUrl(redirectedUrl)) {
              throw new AdapterError(
                "davinagaz",
                "blocked",
                "HTTP_BLOCKED: Davinagaz.by перенаправил поиск за разрешённые границы",
              );
            }
            url = redirectedUrl;
            continue;
          }
          if (response.status === 401 || response.status === 403) {
            throw new AdapterError(
              "davinagaz",
              "blocked",
              `HTTP_BLOCKED: Davinagaz.by вернул HTTP ${response.status}`,
            );
          }
          if (!response.ok) {
            throw new AdapterError(
              "davinagaz",
              "network",
              `HTTP_BLOCKED: Davinagaz.by вернул HTTP ${response.status}`,
            );
          }
          return {
            html,
            status: response.status,
            url: url.toString(),
            method: "html",
          };
        }
        throw new AdapterError(
          "davinagaz",
          "network",
          "HTTP_BLOCKED: превышен лимит перенаправлений Davinagaz.by",
        );
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "davinagaz",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: поиск Davinagaz.by не ответил вовремя"
            : "HTTP_BLOCKED: не удалось загрузить публичный поиск Davinagaz.by",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
}

let defaultLoader:
  ((article: string) => Promise<LoadedDavinagazHtml>) | undefined;

export function loadDavinagazSearchHtml(
  article: string,
): Promise<LoadedDavinagazHtml> {
  defaultLoader ??= createDavinagazSearchLoader();
  return defaultLoader(article);
}
