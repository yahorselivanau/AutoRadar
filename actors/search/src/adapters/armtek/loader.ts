import { z } from "zod";

import { AdapterError } from "../types";
import {
  readArmtekTransportConfig,
  type ArmtekTransportConfig,
} from "./config";

const GuestResponseSchema = z
  .object({
    data: z.object({ accessToken: z.string().min(1) }),
  })
  .passthrough();

const SearchTypeResponseSchema = z
  .object({
    data: z.object({
      searchType: z.number().int().nonnegative(),
      categoryAlias: z.string().min(1).optional(),
      filters: z.preprocess(
        (value) =>
          Array.isArray(value) && value.length === 0 ? undefined : value,
        z
          .record(z.string(), z.union([z.string(), z.array(z.string())]))
          .optional(),
      ),
    }),
  })
  .passthrough();

export interface LoadedArmtekJson {
  payload: unknown;
  status: number;
  url: string;
}

interface ArmtekLoaderOptions {
  config?: ArmtekTransportConfig;
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

function requireApiOrigin(config: ArmtekTransportConfig): URL {
  const baseUrl = new URL(config.ARMTEK_BASE_URL);
  if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "armtek.by") {
    throw new AdapterError(
      "armtek",
      "unsupported-query",
      "DOM_CHANGED: разрешён только публичный HTTPS API armtek.by",
    );
  }
  return new URL("/rest/ru/", baseUrl);
}

function mapHttpError(status: number, operation: string): AdapterError {
  if (status === 401 || status === 403) {
    return new AdapterError(
      "armtek",
      "blocked",
      `HTTP_BLOCKED: Armtek.by отклонил ${operation} (HTTP ${status})`,
    );
  }
  if (status === 429) {
    return new AdapterError(
      "armtek",
      "rate-limited",
      "HTTP_BLOCKED: Armtek.by временно ограничил публичный поиск",
    );
  }
  return new AdapterError(
    "armtek",
    "network",
    `HTTP_BLOCKED: Armtek.by вернул HTTP ${status} для ${operation}`,
  );
}

export function createArmtekSearchLoader(
  options: ArmtekLoaderOptions = {},
): (query: string) => Promise<LoadedArmtekJson> {
  const config = options.config ?? readArmtekTransportConfig();
  const fetchImpl =
    options.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));
  let accessToken: string | undefined;

  return (query) =>
    schedule(config.ARMTEK_REQUEST_INTERVAL_MS, async () => {
      const apiOrigin = requireApiOrigin(config);
      if (!config.ARMTEK_GUEST_AUTH_TOKEN) {
        throw new AdapterError(
          "armtek",
          "blocked",
          "HTTP_BLOCKED: для публичной гостевой сессии Armtek.by не настроен ARMTEK_GUEST_AUTH_TOKEN",
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.ARMTEK_HTTP_TIMEOUT_MS,
      );
      const commonHeaders = {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": config.ARMTEK_USER_AGENT,
        "x-ca-external-system": "IM_BY",
        "x-ca-vkorg": "2000",
      };

      try {
        const authenticate = async () => {
          const url = new URL("auth-microservice/v1/guest", apiOrigin);
          const response = await fetchImpl(url, {
            method: "POST",
            headers: {
              ...commonHeaders,
              "x-auth-system": "AUTH_MICROSERVICE_V1_ARMTEK_RU",
              "x-auth-token": config.ARMTEK_GUEST_AUTH_TOKEN!,
            },
            body: "{}",
            redirect: "error",
            signal: controller.signal,
          });
          if (!response.ok) throw mapHttpError(response.status, "guest auth");
          const parsed = GuestResponseSchema.safeParse(await response.json());
          if (!parsed.success) {
            throw new AdapterError(
              "armtek",
              "parse",
              "DOM_CHANGED: Armtek.by изменил ответ гостевой авторизации",
              { cause: parsed.error },
            );
          }
          accessToken = parsed.data.data.accessToken;
        };

        const authorizedFetch = async (
          url: URL,
          init: RequestInit = {},
          mayRetry = true,
        ): Promise<Response> => {
          if (!accessToken) await authenticate();
          const response = await fetchImpl(url, {
            ...init,
            headers: {
              ...commonHeaders,
              authorization: `Bearer ${accessToken}`,
              ...init.headers,
            },
            redirect: "error",
            signal: controller.signal,
          });
          if (response.status === 401 && mayRetry) {
            accessToken = undefined;
            await authenticate();
            return authorizedFetch(url, init, false);
          }
          if (!response.ok) throw mapHttpError(response.status, "search");
          return response;
        };

        const typeUrl = new URL(
          "search-microservice/v1/search/type",
          apiOrigin,
        );
        typeUrl.searchParams.set("query", query);
        const typeResponse = await authorizedFetch(typeUrl);
        const parsedType = SearchTypeResponseSchema.safeParse(
          await typeResponse.json(),
        );
        if (!parsedType.success) {
          throw new AdapterError(
            "armtek",
            "parse",
            "DOM_CHANGED: Armtek.by изменил определение типа поиска",
            { cause: parsedType.error },
          );
        }

        const searchType = parsedType.data.data;
        const byCategory = Boolean(searchType.categoryAlias);
        const searchUrl = new URL(
          byCategory
            ? "search-microservice/v1/search/by-category"
            : "search-microservice/v1/search",
          apiOrigin,
        );
        const body = byCategory
          ? {
              query: searchType.categoryAlias,
              page: 1,
              filters: {
                ...searchType.filters,
                text: query,
                from_global: "true",
              },
              linkingTargetType: "P",
              userInfo: { VKORG: "2000", VSTELS_LIST: ["MI51"] },
            }
          : {
              query,
              queryType: searchType.searchType,
              page: 1,
              filters: { text: query },
              userInfo: { VKORG: "2000", VSTELS_LIST: ["MI51"] },
              ZZSIGN: "S",
            };
        const response = await authorizedFetch(searchUrl, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return {
          payload: await response.json(),
          status: response.status,
          url: searchUrl.toString(),
        };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new AdapterError(
          "armtek",
          timedOut ? "timeout" : "network",
          timedOut
            ? "TIMEOUT: поиск Armtek.by не ответил вовремя"
            : "HTTP_BLOCKED: не удалось выполнить публичный поиск Armtek.by",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
}

let defaultLoader: ((query: string) => Promise<LoadedArmtekJson>) | undefined;

export function loadArmtekSearchJson(query: string): Promise<LoadedArmtekJson> {
  defaultLoader ??= createArmtekSearchLoader();
  return defaultLoader(query);
}
