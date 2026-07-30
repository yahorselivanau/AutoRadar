import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { RemzonaPartsAdapter } from ".";
import type { RemzonaTransportConfig } from "./config";
import { createRemzonaHtmlLoader } from "./loader";
import {
  findRemzonaMakeCatalogPath,
  normalizeRemzonaPrice,
  parseRemzonaCatalogHtml,
  parseRemzonaSearchCandidates,
} from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: RemzonaTransportConfig = {
  REMZONA_BASE_URL: "https://remzona.by/",
  REMZONA_USER_AGENT: "AutoRadar test",
  REMZONA_HTTP_TIMEOUT_MS: 3_000,
  REMZONA_REQUEST_INTERVAL_MS: 1_000,
  REMZONA_PLAYWRIGHT_FALLBACK_ENABLED: false,
};

const request = SearchRequestSchema.parse({
  query: "стеклоподъемник",
  part: { name: "Стеклоподъемник" },
});

describe("Remzona price parser", () => {
  it("matches a localized make against the Latin catalog label", () => {
    expect(
      findRemzonaMakeCatalogPath(
        '<a href="/catalog/peugeot/steklopodiemnik">PEUGEOT</a>',
        "/steklopodiemnik",
        "Пежо",
      ),
    ).toBe("/catalog/peugeot/steklopodiemnik");
  });

  it("normalizes the verified catalog card and BYN price", async () => {
    const offers = parseRemzonaCatalogHtml(
      await fixture("catalog-success.html"),
      "2026-07-29T00:00:00.000Z",
    );

    expect(normalizeRemzonaPrice("1 234,56 руб.")).toBe("1234.56");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      externalId: "4584933",
      externalUrl: "https://remzona.by/stellox/8731719sx",
      priceAmount: "2.00",
      priceSource: "dom",
      currency: "BYN",
      availability: "7 шт.",
      deliveryText: "на четверг",
    });
  });

  it("handles the verified empty catalog", async () => {
    expect(
      parseRemzonaCatalogHtml(await fixture("catalog-empty.html")),
    ).toEqual([]);
  });
});

describe("Remzona adapter modes", () => {
  it("returns priced offers in HTTP mode without Playwright", async () => {
    const searchHtml = await fixture("search-category.html");
    const catalogHtml = await fixture("catalog-success.html");
    const searchLoader = vi.fn(async () => ({
      html: searchHtml,
      status: 200,
    }));
    const fallback = vi.fn();
    const adapter = new RemzonaPartsAdapter(
      searchLoader,
      async () => ({ html: catalogHtml, status: 200 }),
      fallback,
      false,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("html");
    expect(result.offers[0]?.priceAmount).toBe("2.00");
    expect(searchLoader).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses Playwright fallback when HTTP contains no price", async () => {
    const searchHtml = await fixture("search-category.html");
    const catalogHtml = await fixture("catalog-success.html");
    const withoutPrice = catalogHtml
      .replaceAll('data-cur="BYN"', 'data-cur="USD"')
      .replaceAll(">byn<", ">usd<");
    const fallback = vi.fn(async () => ({ html: catalogHtml, status: 200 }));
    const adapter = new RemzonaPartsAdapter(
      async () => ({ html: searchHtml, status: 200 }),
      async () => ({ html: withoutPrice, status: 200 }),
      fallback,
      true,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("playwright");
    expect(result.offers[0]?.priceAmount).toBe("2.00");
    expect(fallback).toHaveBeenCalledWith(
      "/steklopodiemnik",
      ".box-articleitems .item-list",
    );
  });

  it("keeps real SSR offers when the source does not publish a price", async () => {
    const searchHtml = await fixture("search-category.html");
    const catalogHtml = (await fixture("catalog-success.html"))
      .replaceAll('data-cur="BYN"', 'data-cur="USD"')
      .replaceAll(">byn<", ">usd<");
    const adapter = new RemzonaPartsAdapter(
      async () => ({ html: searchHtml, status: 200 }),
      async () => ({ html: catalogHtml, status: 200 }),
      vi.fn(),
      false,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      externalId: "4584933",
      priceAmount: undefined,
      priceSource: undefined,
    });
  });

  it("returns DOM_CHANGED instead of an empty success", async () => {
    const searchHtml = await fixture("search-category.html");
    const adapter = new RemzonaPartsAdapter(
      async () => ({ html: searchHtml, status: 200 }),
      async () => ({
        html: '<div class="box-articleitems"><div class="item-list"></div></div>',
        status: 200,
      }),
      vi.fn(),
      false,
    );

    await expect(adapter.search(request)).rejects.toThrow("DOM_CHANGED");
  });

  it("uses a structured article suggestion and confirms the unchanged number", async () => {
    const searchHtml = await fixture("search-success.html");
    const candidates = parseRemzonaSearchCandidates(searchHtml);
    expect(candidates[0]).toMatchObject({
      kind: "product",
      rawPartNumber: "7700274177",
      normalizedPartNumber: "7700274177",
    });

    const adapter = new RemzonaPartsAdapter(
      async () => ({ html: searchHtml, status: 200 }),
      async (path) => ({
        html: `<html><head>
          <link rel="canonical" href="https://remzona.by${path}">
          <script type="application/ld+json">
            {"@type":"Product","offers":{"price":"12.50","priceCurrency":"BYN"}}
          </script>
        </head><body><h1>Масляный фильтр RENAULT</h1></body></html>`,
        status: 200,
      }),
      vi.fn(),
      false,
    );
    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "7700 274 177",
        part: { name: "Масляный фильтр", rawPartNumber: "7700 274 177" },
      }),
    );

    expect(result.offers[0]).toMatchObject({
      rawPartNumber: "7700274177",
      normalizedPartNumber: "7700274177",
      matchStatus: "confirmed",
      matchReasons: ["Точный артикул в структурированной подсказке Remzona.by"],
    });
  });
});

describe("Remzona public search XHR", () => {
  it("sends the observed form fields over HTTP", async () => {
    let body = "";
    const loader = createRemzonaHtmlLoader({
      config,
      fetchImpl: async (_url, init) => {
        body = init?.body?.toString() ?? "";
        return new Response("", { status: 200 });
      },
    });

    await loader("стеклоподъемник");
    expect(body).toBe(
      "typerequest=search&q=%D1%81%D1%82%D0%B5%D0%BA%D0%BB%D0%BE%D0%BF%D0%BE%D0%B4%D1%8A%D0%B5%D0%BC%D0%BD%D0%B8%D0%BA",
    );
  });
});
