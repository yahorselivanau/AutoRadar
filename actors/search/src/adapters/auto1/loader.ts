import { createHttpClient } from "../../transport";
import type { FetchHtmlResult } from "../../transport";
import { AdapterError } from "../types";
import { readAuto1TransportConfig, type Auto1TransportConfig } from "./config";
import { createAuto1ChallengeSolver, type Auto1ChallengeSolver } from "./hg-security";

export interface LoadedAuto1Html {
  html: string;
  status: number;
  url: string;
}

interface Auto1LoaderOptions {
  config?: Auto1TransportConfig;
  fetchImpl?: typeof globalThis.fetch;
  solver?: Auto1ChallengeSolver;
}

const CATALOG_PATH_PATTERN = /^\/auto(?:\/\d+){0,3}$/;

function assertPublicAuto1Url(url: URL): void {
  if (url.protocol !== "https:" || url.hostname !== "auto1.by") {
    throw new AdapterError(
      "auto1",
      "unsupported-query",
      "DOM_CHANGED: разрешён только публичный HTTPS-поиск auto1.by",
    );
  }
}

function assertAllowedCatalogPath(pathname: string): void {
  if (!CATALOG_PATH_PATTERN.test(pathname)) {
    throw new AdapterError(
      "auto1",
      "unsupported-query",
      `DOM_CHANGED: путь ${pathname} не входит в публичный каталог auto1.by`,
    );
  }
}

export function createAuto1SearchLoader(
  options: Auto1LoaderOptions = {},
): (query: string) => Promise<LoadedAuto1Html> {
  const config = options.config ?? readAuto1TransportConfig();
  const solver = options.solver ?? defaultSolver;
  const http = createHttpClient({
    sourceId: "auto1",
    baseUrl: config.AUTO1_BASE_URL,
    timeoutMs: config.AUTO1_HTTP_TIMEOUT_MS,
    intervalMs: config.AUTO1_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
    challengeSolver: solver.solve.bind(solver),
  });

  return async (query) => {
    const baseUrl = new URL(config.AUTO1_BASE_URL);
    const url = new URL("/Search", baseUrl);
    assertPublicAuto1Url(url);
    url.searchParams.set("pattern", query);

    const result: FetchHtmlResult = await http.fetchHtml(url.toString(), {
      uaOverride: config.AUTO1_USER_AGENT,
      headers: solver.cookieHeader(),
    });
    return { html: result.html, status: result.status, url: result.url };
  };
}

export function createAuto1CatalogLoader(
  options: Auto1LoaderOptions = {},
): (path: string) => Promise<LoadedAuto1Html> {
  const config = options.config ?? readAuto1TransportConfig();
  const solver = options.solver ?? defaultSolver;
  const http = createHttpClient({
    sourceId: "auto1",
    baseUrl: config.AUTO1_BASE_URL,
    timeoutMs: config.AUTO1_HTTP_TIMEOUT_MS,
    intervalMs: config.AUTO1_REQUEST_INTERVAL_MS,
    fetchImpl: options.fetchImpl,
    challengeSolver: solver.solve.bind(solver),
  });

  return async (path) => {
    const [pathname, rawSearch = ""] = path.split("?");
    if (rawSearch) {
      const search = new URLSearchParams(rawSearch);
      if (search.get("groupId") && !/^\/auto(?:\/\d+){3}$/.test(pathname ?? "")) {
        throw new AdapterError(
          "auto1",
          "unsupported-query",
          `DOM_CHANGED: groupId допустим только на странице двигателя (${pathname})`,
        );
      }
    }
    assertAllowedCatalogPath(pathname ?? "");

    const baseUrl = new URL(config.AUTO1_BASE_URL);
    const url = new URL(pathname ?? "/auto", baseUrl);
    assertPublicAuto1Url(url);
    if (rawSearch) url.search = rawSearch;

    const result: FetchHtmlResult = await http.fetchHtml(url.toString(), {
      uaOverride: config.AUTO1_USER_AGENT,
      headers: solver.cookieHeader(),
    });
    return { html: result.html, status: result.status, url: result.url };
  };
}

const defaultSolver: Auto1ChallengeSolver = createAuto1ChallengeSolver();

let defaultLoader: ((query: string) => Promise<LoadedAuto1Html>) | undefined;
let defaultCatalogLoader:
  | ((path: string) => Promise<LoadedAuto1Html>)
  | undefined;

export function loadAuto1SearchHtml(query: string): Promise<LoadedAuto1Html> {
  defaultLoader ??= createAuto1SearchLoader();
  return defaultLoader(query);
}

export function loadAuto1CatalogHtml(path: string): Promise<LoadedAuto1Html> {
  defaultCatalogLoader ??= createAuto1CatalogLoader();
  return defaultCatalogLoader(path);
}
