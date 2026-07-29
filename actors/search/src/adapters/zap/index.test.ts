import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { ZapPartsAdapter } from ".";
import type { ZapTransportConfig } from "./config";
import { createZapPageLoader, resolveZapCatalogUrl } from "./loader";
import {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  parseZapCatalogHtml,
} from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: ZapTransportConfig = {
  ZAP_BASE_URL: "https://zap.by/",
  ZAP_USER_AGENT: "AutoRadar test",
  ZAP_HTTP_TIMEOUT_MS: 3_000,
  ZAP_REQUEST_INTERVAL_MS: 250,
  ZAP_RESULT_LIMIT: 50,
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
    ]);
  });

  it("does not call the forbidden search route for an OEM-only request", async () => {
    const loader = vi.fn();
    const adapter = new ZapPartsAdapter(loader, 50);
    const oemRequest = SearchRequestSchema.parse({
      query: "7700274177",
      part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
    });

    await expect(adapter.search(oemRequest)).rejects.toThrow(
      "ROBOTS_DISALLOWED",
    );
    expect(loader).not.toHaveBeenCalled();
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
