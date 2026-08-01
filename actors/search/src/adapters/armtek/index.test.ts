import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { ArmtekPartsAdapter, getArmtekQuery } from ".";
import {
  readArmtekTransportConfig,
  type ArmtekTransportConfig,
} from "./config";
import {
  canonicalArmtekPartName,
  canonicalArmtekVehicleMake,
  normalizeArmtekQuery,
} from "./catalog";
import { createArmtekSearchLoader } from "./loader";
import { evaluateArmtekOffer } from "./matcher";
import { parseArmtekSearchPayload } from "./parser";

const fixture = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;

const config: ArmtekTransportConfig = {
  ARMTEK_BASE_URL: "https://armtek.by/",
  ARMTEK_GUEST_AUTH_TOKEN: "fixture-public-client-key",
  ARMTEK_USER_AGENT: "AutoRadar test",
  ARMTEK_HTTP_TIMEOUT_MS: 3_000,
  ARMTEK_REQUEST_INTERVAL_MS: 500,
  ARMTEK_RESULT_LIMIT: 30,
};

const articleRequest = SearchRequestSchema.parse({
  query: "7700274177",
  part: {
    name: "Масляный фильтр",
    rawPartNumber: "7700274177",
    condition: "new",
  },
});

describe("Armtek config", () => {
  it("treats an empty example credential as absent", () => {
    expect(
      readArmtekTransportConfig({ ARMTEK_GUEST_AUTH_TOKEN: "" })
        .ARMTEK_GUEST_AUTH_TOKEN,
    ).toBeUndefined();
  });
});

describe("Armtek catalog", () => {
  it("uses the copied Armtek spelling for makes and part names", () => {
    expect(canonicalArmtekVehicleMake("Volkswagen")).toBe("VW");
    expect(canonicalArmtekVehicleMake("CITROEN")).toBe("CITROËN");
    expect(canonicalArmtekPartName("салонный фильтр")).toBe("Фильтр салона");
    expect(canonicalArmtekPartName("тормозные колодки")).toBe(
      "Комплект тормозных колодок",
    );
  });

  it("rewrites known labels inside a free-text query without losing vehicle data", () => {
    expect(
      normalizeArmtekQuery(
        "Найди тормозные колодки Volkswagen Golf",
        "тормозные колодки",
        "Volkswagen",
      ),
    ).toBe("Найди Комплект тормозных колодок VW Golf");
  });
});

describe("Armtek public JSON parser", () => {
  it("normalizes each observed purchasable suggestion", async () => {
    const offers = parseArmtekSearchPayload(
      await fixture("search-success.json"),
      "2026-07-30T00:00:00.000Z",
    );

    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      sourceId: "armtek",
      externalId: "37519801-868938-0000156495",
      externalUrl:
        "https://armtek.by/product/filtr-maslyanyy-no-brand-7700274177-37519801",
      title: "Фильтр масляный",
      brand: "РФ",
      rawPartNumber: "7700274177",
      normalizedPartNumber: "7700274177",
      condition: "new",
      partKind: "unknown",
      priceAmount: "10.01",
      priceSource: "api",
      currency: "BYN",
      availability: "2 шт.",
      deliveryText: "Отгрузка 31.07.2026 09:00",
      sellerName: "ARMTEK",
      sellerRatingPercent: 95,
      sourceAttributes: {
        armtekArticleId: ["37519801"],
        armtekSupplierReference: ["868938"],
        armtekWarehouseReference: ["0000156495"],
      },
    });
    expect(offers[1]?.imageUrl).toBe(
      "https://img.armtek.ru/img/article/517/517827/230x230/517827_0.webp",
    );
  });

  it("distinguishes an observed empty response from a changed contract", async () => {
    expect(
      parseArmtekSearchPayload(await fixture("search-empty.json")),
    ).toEqual([]);
    expect(() => parseArmtekSearchPayload({ data: { products: [] } })).toThrow(
      "DOM_CHANGED",
    );
  });
});

describe("Armtek adapter", () => {
  it("uses the supplied article verbatim and confirms exact PINs", async () => {
    expect(getArmtekQuery(articleRequest)).toBe("7700274177");
    const adapter = new ArmtekPartsAdapter(
      async () => ({
        payload: await fixture("search-success.json"),
        status: 200,
        url: "https://armtek.by/rest/ru/search-microservice/v1/search",
      }),
      30,
    );

    const result = await adapter.search(articleRequest);

    expect(result.method).toBe("json");
    expect(result.offers).toHaveLength(3);
    expect(result.offers[0]).toMatchObject({
      matchStatus: "confirmed",
      matchReasons: ["Точный артикул в публичной выдаче Armtek.by"],
    });
  });

  it("keeps only text cards with part and vehicle evidence", async () => {
    const offers = parseArmtekSearchPayload(
      await fixture("search-success.json"),
    );
    const request = SearchRequestSchema.parse({
      query: "Масляный фильтр Renault Clio",
      vehicle: { make: "Renault", model: "Clio", year: 2010 },
      part: { name: "Масляный фильтр", condition: "new" },
    });

    expect(evaluateArmtekOffer(offers[0]!, request)).toBeUndefined();
    expect(evaluateArmtekOffer(offers[1]!, request)).toMatchObject({
      matchStatus: "possible",
    });
  });

  it("does not call a new-parts source for a used-only request", async () => {
    const loader = vi.fn();
    const adapter = new ArmtekPartsAdapter(loader, 30);
    await expect(
      adapter.search(
        SearchRequestSchema.parse({
          query: "Капот б/у",
          part: { name: "Капот", condition: "used" },
        }),
      ),
    ).resolves.toEqual({ method: "json", offers: [] });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("Armtek public API loader", () => {
  it("bootstraps a cookieless guest and maps article search exactly", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const loader = createArmtekSearchLoader({
      config,
      fetchImpl: async (url, init) => {
        requests.push({ url: url.toString(), init });
        const pathname = new URL(url.toString()).pathname;
        if (pathname.endsWith("/auth-microservice/v1/guest")) {
          return Response.json({ data: { accessToken: "fixture-access" } });
        }
        if (pathname.endsWith("/search/type")) {
          return Response.json({ data: { searchType: 1 } });
        }
        return Response.json(await fixture("search-empty.json"));
      },
    });

    await loader("7700274177");

    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toBe(
      "https://armtek.by/rest/ru/auth-microservice/v1/guest",
    );
    expect(new Headers(requests[0]?.init?.headers).get("x-auth-token")).toBe(
      "fixture-public-client-key",
    );
    expect(new Headers(requests[2]?.init?.headers).get("authorization")).toBe(
      "Bearer fixture-access",
    );
    expect(new Headers(requests[2]?.init?.headers).has("cookie")).toBe(false);
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      query: "7700274177",
      queryType: 1,
      page: 1,
      filters: { text: "7700274177" },
    });
  });

  it("uses the observed category endpoint and server-provided filters", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const loader = createArmtekSearchLoader({
      config: { ...config, ARMTEK_REQUEST_INTERVAL_MS: 501 },
      fetchImpl: async (url, init) => {
        requests.push({ url: url.toString(), init });
        const pathname = new URL(url.toString()).pathname;
        if (pathname.endsWith("/auth-microservice/v1/guest")) {
          return Response.json({ data: { accessToken: "fixture-access" } });
        }
        if (pathname.endsWith("/search/type")) {
          return Response.json({
            data: {
              searchType: 10,
              categoryAlias: "filtry-maslyanye-8963",
              filters: { BRAND: ["renault-4880"] },
            },
          });
        }
        return Response.json(await fixture("search-empty.json"));
      },
    });

    await loader("масляный фильтр Renault");

    expect(requests[2]?.url).toBe(
      "https://armtek.by/rest/ru/search-microservice/v1/search/by-category",
    );
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      query: "filtry-maslyanye-8963",
      page: 1,
      filters: {
        BRAND: ["renault-4880"],
        text: "масляный фильтр Renault",
        from_global: "true",
      },
      linkingTargetType: "P",
    });
  });

  it("accepts the observed empty filters array for a text search", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const loader = createArmtekSearchLoader({
      config: { ...config, ARMTEK_REQUEST_INTERVAL_MS: 502 },
      fetchImpl: async (url, init) => {
        requests.push({ url: url.toString(), init });
        const pathname = new URL(url.toString()).pathname;
        if (pathname.endsWith("/auth-microservice/v1/guest")) {
          return Response.json({ data: { accessToken: "fixture-access" } });
        }
        if (pathname.endsWith("/search/type")) {
          return Response.json({ data: { searchType: 1, filters: [] } });
        }
        return Response.json(await fixture("search-empty.json"));
      },
    });

    await expect(loader("масляный фильтр BMW 3 серия")).resolves.toMatchObject({
      status: 200,
    });
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      query: "масляный фильтр BMW 3 серия",
      queryType: 1,
      filters: { text: "масляный фильтр BMW 3 серия" },
    });
  });

  it("fails closed when the server-only client credential is absent", async () => {
    const fetchImpl = vi.fn();
    const loader = createArmtekSearchLoader({
      config: { ...config, ARMTEK_GUEST_AUTH_TOKEN: undefined },
      fetchImpl,
    });

    await expect(loader("7700274177")).rejects.toMatchObject({
      sourceId: "armtek",
      code: "blocked",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
