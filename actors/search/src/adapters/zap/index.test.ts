import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import {
  detectZapPlacement,
  filterZapOffersByPlacement,
  matchesZapPartIdentity,
  ZapPartsAdapter,
} from ".";
import { readZapTransportConfig, type ZapTransportConfig } from "./config";
import { createZapPageLoader, resolveZapCatalogUrl } from "./loader";
import {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  parseZapCatalogHtml,
  parseZapCatalogMetadata,
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

describe("Zap.by transport config", () => {
  it("keeps the public HTTP timeout inside the architectural budget", () => {
    expect(
      readZapTransportConfig({ ZAP_HTTP_TIMEOUT_MS: "10000" })
        .ZAP_HTTP_TIMEOUT_MS,
    ).toBe(10_000);
  });
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

  it("reads the verified category and vehicle IDs from the supplied catalog page", async () => {
    const html = await fixture("catalog-mislabeled-oil-pump.html");

    expect(parseZapCatalogMetadata(html)).toEqual({
      categoryId: "525",
      vehicleManufacturerId: "16",
      vehicleModelId: "9831",
      vehicleTypeId: "59409",
      canonicalPath: "/carparts/bmw/3-f30-f80/320-i-59409/maslyanyi-nasos",
    });
    expect(parseZapCatalogHtml(html)[0]).toMatchObject({
      title: "Масляный насос STELLOX 20-51145-SX",
      description: "фильтр АКПП! BMW F20/F21/F30/F31/F10/F11",
      sourceAttributes: {
        catalogCategoryId: ["525"],
        catalogVehicleManufacturerId: ["16"],
        catalogVehicleModelId: ["9831"],
        catalogVehicleTypeId: ["59409"],
      },
      compatibilityText:
        "Каталог Zap.by: BMW · 3 Series · 320 i · Детали двигателя",
    });
  });

  it("matches a localized make against the Latin catalog label", () => {
    expect(
      findZapMakePath(
        `<div class="dropdown mrgb10">
          <a class="btn-lg" href="/carparts/peugeot">PEUGEOT</a>
        </div>`,
        "Пежо",
      ),
    ).toBe("/carparts/peugeot");
  });

  it("uses the selected-vehicle hidden IDs when inline variables are absent", () => {
    expect(
      parseZapCatalogMetadata(`
        <input id="ses_sel_manufacturer" name="ses_sel_manufacturer" value="16">
        <input id="ses_sel_model" name="ses_sel_model" value="9831">
        <input id="ses_sel_type" name="ses_sel_type" value="59409">
        <input id="search-category-id" name="category_id" value="0">
      `),
    ).toEqual({
      categoryId: undefined,
      vehicleManufacturerId: "16",
      vehicleModelId: "9831",
      vehicleTypeId: "59409",
      canonicalPath: undefined,
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

  it("accepts a spaced OEM article but rejects unrelated search neighbors", () => {
    const oemRequest = SearchRequestSchema.parse({
      query: "7700274177",
      part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
    });

    expect(
      matchesZapPartIdentity(
        {
          ...baseOffer,
          brand: "OEM",
          rawPartNumber: "7700274177",
          title: "OEM 77 00 274 177 Масляный фильтр",
        },
        oemRequest,
      ),
    ).toBe(true);
    expect(
      matchesZapPartIdentity(
        {
          ...baseOffer,
          brand: "GANZ",
          rawPartNumber: "GIE11409",
          title: "GANZ GIE11409 Прокладка сливной пробки",
        },
        oemRequest,
      ),
    ).toBe(false);
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

  it("uses the supplied Zap.by category vocabulary without inventing a URL", () => {
    const model = `
      <a class="carparts-category-cards__item"
         href="/carparts/audi/a4/vodyanoy-nasos">Водяной насос / помпа</a>
      <a class="carparts-category-cards__item"
         href="/carparts/audi/a4/pompa-other">Помпа рулевого управления</a>`;

    expect(findZapCategoryPath(model, "/carparts/audi/a4", "помпа")).toBe(
      "/carparts/audi/a4/vodyanoy-nasos",
    );
    expect(
      findZapCategoryPath(model, "/carparts/audi/a4", "водяной насос"),
    ).toBe("/carparts/audi/a4/vodyanoy-nasos");
  });

  it("resolves a conversational window-regulator name to the observed label", () => {
    expect(
      findZapCategoryPath(
        '<a class="cct-node__content" href="/carparts/audi/a4/steklopodemnik">Стеклоподъемник</a>',
        "/carparts/audi/a4",
        "механизм стеклоподъёмника",
      ),
    ).toBe("/carparts/audi/a4/steklopodemnik");
  });

  it("does not choose between equally similar observed categories", () => {
    const model = `
      <a class="carparts-category-cards__item" href="/carparts/audi/a4/a">Прокладка поддона</a>
      <a class="carparts-category-cards__item" href="/carparts/audi/a4/b">Прокладка КПП</a>`;

    expect(
      findZapCategoryPath(model, "/carparts/audi/a4", "Прокладка"),
    ).toBeUndefined();
  });

  it("allows the search route explicitly covered by the supplied robots.txt", () => {
    expect(
      resolveZapCatalogUrl("https://zap.by/", "/carparts/search/7700274177"),
    ).toBe("https://zap.by/carparts/search/7700274177");
  });
});

describe("Zap.by adapter", () => {
  it("loads engine options before any parts category search", async () => {
    const pages = new Map([
      [
        "/carparts",
        '<div class="dropdown mrgb10"><a class="btn btn-lg" href="/carparts/toyota">TOYOTA</a></div>',
      ],
      [
        "/carparts/toyota",
        '<a class="ajax" href="/carparts/toyota/aygo">AYGO</a>',
      ],
      [
        "/carparts/toyota/aygo",
        `<a data-item="model" data-value="1200">
          <span class="font-14">AYGO (B1)</span>
          <span class="small">2005 - 2014</span>
        </a>`,
      ],
    ]);
    const loader = vi.fn(async (path: string) => ({
      html: pages.get(path) ?? "",
      path,
      status: 200,
    }));
    const jsonLoader = vi.fn().mockResolvedValue({
      html: `<a data-item="type" data-value="1">
        <span class="font-14">1.0 VVT-i</span>
        <span class="text-muted">2005 - 2014</span>
      </a>
      <a data-item="type" data-value="2">
        <span class="font-14">1.4 D-4D</span>
        <span class="text-muted">2005 - 2010</span>
      </a>`,
    });
    const adapter = new ZapPartsAdapter(loader, 50, jsonLoader, 12);
    const result = await adapter.resolveEngineOptions(
      SearchRequestSchema.parse({
        query: "задняя ступица Toyota Aygo 2009",
        vehicle: { make: "TOYOTA", model: "AYGO", year: 2009 },
        part: { name: "Ступица колеса", position: "rear" },
      }),
    );

    expect(result.kind).toBe("engines");
    if (result.kind === "engines") {
      expect(result.vehicle.id).toBe("1200");
      expect(result.engines.map((engine) => engine.label)).toEqual([
        "1.0 VVT-i",
        "1.4 D-4D",
      ]);
    }
    expect(jsonLoader).toHaveBeenCalledWith("/index.php", {
      route: "catalog/parts/choice3d",
      model: "1200",
    });
    expect(loader.mock.calls.map(([path]) => path)).toEqual([
      "/carparts",
      "/carparts/toyota",
      "/carparts/toyota/aygo",
    ]);
  });

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

  it("uses the public SSR search route for an OEM-only request", async () => {
    const productHtml = await fixture("catalog-success.html");
    const loader = vi.fn(async (path: string) => ({
      html:
        path === "/carparts/search/7700274177"
          ? '<div id="content"><a href="/nakayama/fo169ny">NAKAYAMA FO169NY</a></div>'
          : productHtml,
      path,
      status: 200,
    }));
    const adapter = new ZapPartsAdapter(loader, 50);
    const oemRequest = SearchRequestSchema.parse({
      query: "7700274177",
      part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
    });

    const result = await adapter.search(oemRequest);

    expect(result.offers.map((offer) => offer.externalId)).toEqual([
      "NAKAYAMAFO169NY",
    ]);
    expect(loader.mock.calls.map(([path]) => path)).toEqual([
      "/carparts/search/7700274177",
      "/nakayama/fo169ny",
      "/nakayama/fo169ny",
    ]);
  });

  it("uses direct text search when vehicle context is absent", async () => {
    const placementHtml = await fixture("catalog-placement.html");
    const loader = vi.fn(async (path: string) => ({
      html: placementHtml,
      path,
      status: 200,
    }));
    const adapter = new ZapPartsAdapter(loader, 50);
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
    const adapter = new ZapPartsAdapter(loader, 50);
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

  it("keeps the generic category as a fallback when an exact engine page is mislabeled", async () => {
    const genericHtml = `${await fixture("catalog-success.html")}
      <script>let section_id = 777;</script>`;
    const exactHtml = await fixture("catalog-mislabeled-oil-pump.html");
    const pages = new Map([
      [
        "/carparts",
        '<div class="dropdown mrgb10"><a class="btn btn-lg" href="/carparts/audi">AUDI</a></div>',
      ],
      ["/carparts/audi", '<a class="ajax" href="/carparts/audi/a4">A4</a>'],
      [
        "/carparts/audi/a4",
        `<a data-item="model" data-value="800">
          <span class="font-14">A4 (B8)</span>
          <span class="small">2007 - 2015</span>
        </a>
        <a class="carparts-category-cards__item"
           href="/carparts/audi/a4/maslyanyi-filtr">Масляный фильтр</a>`,
      ],
      ["/carparts/audi/a4/maslyanyi-filtr", genericHtml],
      ["/carparts/audi/a4-b8/2-7-tdi-900/maslyanyi-filtr", exactHtml],
    ]);
    const loader = vi.fn(async (path: string) => ({
      html: pages.get(path) ?? "",
      path,
      status: 200,
    }));
    const jsonLoader = vi
      .fn()
      .mockResolvedValueOnce({
        html: `<a data-item="type" data-value="900">
          <span class="font-14">2.7 TDI</span>
          <span class="text-muted">2007 - 2015</span>
        </a>`,
      })
      .mockResolvedValueOnce({
        uri: "audi/a4-b8/2-7-tdi-900/maslyanyi-filtr",
      });
    const adapter = new ZapPartsAdapter(loader, 50, jsonLoader, 12);

    const result = await adapter.search(request);

    expect(result.offers.map((offer) => offer.externalId)).toEqual([
      "NAKAYAMAFO169NY",
    ]);
    expect(result.offers[0]?.matchStatus).toBe("possible");
    expect(loader).toHaveBeenCalledWith(
      "/carparts/audi/a4-b8/2-7-tdi-900/maslyanyi-filtr",
    );
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
