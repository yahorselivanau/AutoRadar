import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import {
  detectZapPlacement,
  filterZapOffersByPlacement,
  matchesZapPartIdentity,
  ZapPartsAdapter,
} from ".";
import type { ZapTransportConfig } from "./config";
import { createZapPageLoader, resolveZapCatalogUrl } from "./loader";
import {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  parseZapCatalogHtml,
  parseZapProductHtml,
  parseZapVehicleVariants,
  resolveZapVehicleVariants,
} from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: ZapTransportConfig = {
  ZAP_BASE_URL: "https://zap.by/",
  ZAP_USER_AGENT: "AutoRadar test",
  ZAP_HTTP_TIMEOUT_MS: 3_000,
  ZAP_REQUEST_INTERVAL_MS: 250,
  ZAP_RESULT_LIMIT: 50,
  ZAP_ENRICH_LIMIT: 12,
  ZAP_EXPERIMENTAL_SEARCH_ENABLED: false,
};

const request = SearchRequestSchema.parse({
  query: "масляный фильтр для Audi A4",
  vehicle: {
    make: "AUDI",
    model: "A4",
    year: 2010,
    generation: "B8",
    engine: "2.7 TDI",
  },
  part: { name: "Масляный фильтр" },
});

describe("Zap.by SSR parser", () => {
  it("normalizes a verified product card without guessing classification", async () => {
    const offers = parseZapCatalogHtml(
      await fixture("catalog-success.html"),
      "2026-07-29T09:28:51.701Z",
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      sourceId: "zap",
      externalId: "NAKAYAMAFO169NY",
      externalUrl: "https://zap.by/nakayama/fo169ny",
      title: "Масляный фильтр NAKAYAMA FO169NY",
      brand: "NAKAYAMA",
      rawPartNumber: "FO169NY",
      normalizedPartNumber: "FO169NY",
      condition: "unknown",
      partKind: "unknown",
      priceAmount: "5.30",
      priceSource: "data_attribute",
      availability: ">10 шт.",
      deliveryText: "0-1 дн.",
      sellerName: "Zap.by",
      compatibilityText: "Каталог Zap.by: AUDI · A4 · 2.7 TDI",
    });
  });

  it("handles a verified empty category response", async () => {
    expect(parseZapCatalogHtml(await fixture("catalog-empty.html"))).toEqual(
      [],
    );
  });

  it("keeps only explicitly front-left offers from the verified six cards", async () => {
    const offers = parseZapCatalogHtml(await fixture("catalog-placement.html"));
    const filtered = filterZapOffersByPlacement(offers, {
      name: "Стеклоподъемник",
      side: "left",
      position: "front",
      condition: "any",
      constraints: [],
    });

    expect(filtered.map((offer) => offer.externalId)).toEqual([
      "NTYEPSPE014",
      "NTYEPSPE018",
    ]);
  });

  it("understands Polish labels and mixed Cyrillic spelling", () => {
    expect(detectZapPlacement("LEWY PRZаD")).toEqual({
      side: "left",
      position: "front",
    });
    expect(detectZapPlacement("PRAWY TY")).toEqual({
      side: "right",
      position: "rear",
    });
    expect(detectZapPlacement("передний левый")).toEqual({
      side: "left",
      position: "front",
    });
  });

  it("parses structured product characteristics and applicability", async () => {
    const [offer] = parseZapProductHtml(
      await fixture("product-front-left-5d.html"),
      "/nty/epspe014",
    );

    expect(offer).toMatchObject({
      externalId: "NTYEPSPE014",
      oemNumbers: ["9221 CW"],
      sourceAttributes: {
        mounting: ["спереди слева"],
        operation: ["электрический"],
        motorIncluded: ["false"],
        doorCount: ["5"],
        applicabilityModelId: ["6432"],
      },
    });
  });

  it("resolves the best year-compatible vehicle generation", () => {
    const variants = parseZapVehicleVariants(`
      <a data-item="model" data-value="6432">
        <span class="font-14">308 I (4A_, 4C_)</span>
        <span class="small">.2007 - .2016</span>
      </a>
      <a data-item="model" data-value="11292">
        <span class="font-14">308 II (LB_)</span>
        <span class="small">.2013 - .2021</span>
      </a>
      <a data-item="model" data-value="7376">
        <span class="font-14">308 SW I (4E_)</span>
        <span class="small">.2007 - .2014</span>
      </a>
    `);

    expect(
      resolveZapVehicleVariants(variants, {
        make: "PEUGEOT",
        model: "308",
        year: 2008,
      }).map((variant) => variant.id),
    ).toEqual(["6432", "7376"]);
  });
});

describe("Zap.by part identity", () => {
  const partRequest = SearchRequestSchema.parse({
    query: "Капот BMW 3",
    vehicle: { make: "BMW", model: "3", year: 2016 },
    part: { name: "Капот" },
  });
  const baseOffer = {
    sourceId: "zap" as const,
    externalId: "test",
    externalUrl: "https://zap.by/test/1",
    brand: "OSSCA",
    rawPartNumber: "58541",
    oemNumbers: [],
    condition: "unknown" as const,
    partKind: "unknown" as const,
    currency: "BYN" as const,
    fetchedAt: "2026-07-29T00:00:00.000Z",
    rawPayloadHash: "0".repeat(64),
  };

  it("rejects related subcomponents from a broad category page", () => {
    expect(
      matchesZapPartIdentity(
        { ...baseOffer, title: "OSSCA 58541 Тросик замка капота" },
        partRequest,
      ),
    ).toBe(false);
    expect(
      matchesZapPartIdentity(
        { ...baseOffer, title: "OSSCA 58541 Капот BMW 3 F30" },
        partRequest,
      ),
    ).toBe(true);
  });
});

describe("Zap.by allowed catalog navigation", () => {
  it("resolves only links observed in SSR navigation", () => {
    const root = `
      <div class="dropdown mrgb10">
        <a class="btn btn-default btn-lg" href="/carparts/audi">AUDI</a>
      </div>`;
    const make = `<a class="ajax" href="/carparts/audi/a4">A4</a>`;
    const model = `
      <a class="carparts-category-cards__item"
         href="/carparts/audi/a4/maslyanyi-filtr">Масляный фильтр</a>`;

    expect(findZapMakePath(root, "Audi")).toBe("/carparts/audi");
    expect(findZapModelPath(make, "/carparts/audi", "A4")).toBe(
      "/carparts/audi/a4",
    );
    const bmw = `
      <a class="ajax" href="/carparts/bmw/3-series">3 Series</a>
      <a class="ajax" href="/carparts/bmw/x3">X3</a>`;
    expect(findZapModelPath(bmw, "/carparts/bmw", "3")).toBe(
      "/carparts/bmw/3-series",
    );
    expect(findZapModelPath(bmw, "/carparts/bmw", "X3")).toBe(
      "/carparts/bmw/x3",
    );
    expect(
      findZapCategoryPath(model, "/carparts/audi/a4", "Масляный фильтр"),
    ).toBe("/carparts/audi/a4/maslyanyi-filtr");
  });

  it("rejects the robots-disallowed search route before fetch", () => {
    expect(() =>
      resolveZapCatalogUrl("https://zap.by/", "/carparts/search/7700274177"),
    ).toThrow("ROBOTS_DISALLOWED");
  });
});

describe("Zap.by adapter", () => {
  it("loads the allowed make/model/category ladder and returns SSR offers", async () => {
    const pages = new Map([
      [
        "/carparts",
        '<div class="dropdown mrgb10"><a class="btn btn-lg" href="/carparts/audi">AUDI</a></div>',
      ],
      ["/carparts/audi", '<a class="ajax" href="/carparts/audi/a4">A4</a>'],
      [
        "/carparts/audi/a4",
        '<a class="carparts-category-cards__item" href="/carparts/audi/a4/maslyanyi-filtr">Масляный фильтр</a>',
      ],
      [
        "/carparts/audi/a4/maslyanyi-filtr",
        await fixture("catalog-success.html"),
      ],
    ]);
    const loader = vi.fn(async (path: string) => ({
      html: pages.get(path) ?? "",
      path,
      status: 200,
    }));

    const result = await new ZapPartsAdapter(loader, 50).search(request);

    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(1);
    expect(loader.mock.calls.map(([path]) => path)).toEqual([
      "/carparts",
      "/carparts/audi",
      "/carparts/audi/a4",
      "/carparts/audi/a4/maslyanyi-filtr",
      "/nakayama/fo169ny",
    ]);
  });

  it("does not call the forbidden search route for an OEM-only request", async () => {
    const loader = vi.fn();
    const adapter = new ZapPartsAdapter(loader, 50, false);
    const oemRequest = SearchRequestSchema.parse({
      query: "7700274177",
      part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
    });

    await expect(adapter.search(oemRequest)).rejects.toThrow(
      "ROBOTS_DISALLOWED",
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it("allows the explicitly enabled experimental search route", async () => {
    const placementHtml = await fixture("catalog-placement.html");
    const loader = vi.fn(async (path: string) => ({
      html: placementHtml,
      path,
      status: 200,
    }));
    const adapter = new ZapPartsAdapter(loader, 50, true);
    const textRequest = SearchRequestSchema.parse({
      query: "передний левый стеклоподъемник",
      part: {
        name: "Стеклоподъемник",
        side: "left",
        position: "front",
      },
    });

    const result = await adapter.search(textRequest);

    expect(loader).toHaveBeenCalledWith(
      "/carparts/search/%D0%A1%D1%82%D0%B5%D0%BA%D0%BB%D0%BE%D0%BF%D0%BE%D0%B4%D1%8A%D0%B5%D0%BC%D0%BD%D0%B8%D0%BA",
    );
    expect(result.offers).toEqual([]);
    expect(result.clarification).toMatchObject({
      field: "doors",
      options: [
        { value: 3, label: "3 дверей" },
        { value: 5, label: "5 дверей" },
      ],
    });
  });

  it("returns only the requested door variant after clarification", async () => {
    const placementHtml = await fixture("catalog-placement.html");
    const loader = vi.fn(async (path: string) => ({
      html: placementHtml,
      path,
      status: 200,
    }));
    const adapter = new ZapPartsAdapter(loader, 50, true);
    const textRequest = SearchRequestSchema.parse({
      query: "передний левый стеклоподъемник на пятидверный Peugeot 308",
      part: {
        name: "Стеклоподъемник",
        side: "left",
        position: "front",
        constraints: [{ key: "doorCount", value: "5" }],
      },
    });

    const result = await adapter.search(textRequest);

    expect(result.clarification).toBeUndefined();
    expect(result.offers.map((offer) => offer.externalId)).toEqual([
      "NTYEPSPE014",
    ]);
    expect(result.offers[0]?.matchStatus).toBe("confirmed");
  });

  it("uses a descriptive user agent over ordinary HTTP", async () => {
    let requestedUrl = "";
    let requestedUserAgent = "";
    const loader = createZapPageLoader({
      config,
      fetchImpl: async (url, init) => {
        requestedUrl = url.toString();
        requestedUserAgent = new Headers(init?.headers).get("user-agent") ?? "";
        return new Response("", { status: 200 });
      },
    });

    await loader("/carparts");
    expect(requestedUrl).toBe("https://zap.by/carparts");
    expect(requestedUserAgent).toBe("AutoRadar test");
  });
});
