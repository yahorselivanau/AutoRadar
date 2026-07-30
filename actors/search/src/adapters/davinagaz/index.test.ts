import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import { DavinagazPartsAdapter, getDavinagazArticle } from ".";
import type { DavinagazTransportConfig } from "./config";
import { createDavinagazSearchLoader } from "./loader";
import { parseDavinagazSearchHtml } from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: DavinagazTransportConfig = {
  DAVINAGAZ_BASE_URL: "https://davinagaz.by/",
  DAVINAGAZ_USER_AGENT: "AutoRadar test",
  DAVINAGAZ_HTTP_TIMEOUT_MS: 3_000,
  DAVINAGAZ_REQUEST_INTERVAL_MS: 500,
  DAVINAGAZ_PLAYWRIGHT_FALLBACK_ENABLED: true,
  DAVINAGAZ_PLAYWRIGHT_TIMEOUT_MS: 5_000,
  DAVINAGAZ_RESULT_LIMIT: 30,
};

const request = SearchRequestSchema.parse({
  query: "DBD0262",
  part: { name: "Тормозной диск", rawPartNumber: "DBD0262" },
});

describe("Davinagaz parser", () => {
  it("normalizes the owner-supplied SSR product rows", async () => {
    const offers = parseDavinagazSearchHtml(
      await fixture("search-success.html"),
      "2026-07-30T00:00:00.000Z",
    );

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      sourceId: "davinagaz",
      externalId: "617779",
      externalUrl: "https://davinagaz.by/detail/dbd0262/zennek/",
      title: "Диск тормозной, передний TOYOTA AYGO 05-14",
      brand: "ZENNEK",
      rawPartNumber: "DBD0262",
      normalizedPartNumber: "DBD0262",
      condition: "unknown",
      partKind: "unknown",
      priceAmount: "70",
      priceSource: "dom",
      currency: "BYN",
      availability: "10> (шт.)",
      deliveryText: "Завтра на 31.07.2026",
      sellerName: "Davinagaz.by",
      sourceAttributes: { "Упаковка Davinagaz": ["за 2 шт. комплект"] },
    });
    expect(offers[1]).toMatchObject({
      externalId: "253696",
      imageUrl:
        "https://digital-assets.tecalliance.services/images/400/dbb90fdeb9dc5301f038fad639c9a18848151c32.jpg",
      location: "Склад Гомель два/три часа",
    });
  });

  it("distinguishes a real empty page from an unfinished warehouse load", async () => {
    expect(
      parseDavinagazSearchHtml(await fixture("search-empty.html")),
    ).toEqual([]);
    expect(() =>
      parseDavinagazSearchHtml('<div class="ftr element-for-filter"></div>'),
    ).toThrow("DOM_CHANGED");
    expect(() =>
      parseDavinagazSearchHtml(
        '<div class="is-finder-proccess">Поиск предложений...</div>',
      ),
    ).toThrow("DYNAMIC_RESULTS");
  });
});

describe("Davinagaz adapter", () => {
  it("supports only article search and keeps an exact article match", async () => {
    expect(getDavinagazArticle(request)).toBe("DBD0262");
    const adapter = new DavinagazPartsAdapter(
      async () => ({
        html: await fixture("search-success.html"),
        status: 200,
        url: "https://davinagaz.by/search/number/?article=DBD0262",
        method: "html",
      }),
      30,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      externalId: "617779",
      matchStatus: "confirmed",
      matchReasons: ["Точный артикул в карточке Davinagaz.by"],
    });
    expect(() =>
      getDavinagazArticle(
        SearchRequestSchema.parse({
          query: "Тормозной диск Toyota",
          part: { name: "Тормозной диск" },
        }),
      ),
    ).toThrow("поддерживает только");
  });
});

describe("Davinagaz public HTTP search", () => {
  it("uses the observed GET /search/number/ article parameter without cookies", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    const loader = createDavinagazSearchLoader({
      config,
      fetchImpl: async (url, init) => {
        requestedUrl = url.toString();
        requestedHeaders = init?.headers;
        return new Response(await fixture("search-empty.html"), {
          status: 200,
        });
      },
    });

    await loader("FAG713618870");

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/search/number/");
    expect(url.searchParams.get("article")).toBe("FAG713618870");
    expect(new Headers(requestedHeaders).has("cookie")).toBe(false);
  });

  it("falls back to Playwright for the observed Cloudflare challenge", async () => {
    let fallbackUrl = "";
    const loader = createDavinagazSearchLoader({
      config,
      fetchImpl: async () =>
        new Response(await fixture("search-error.html"), {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
      playwrightLoader: async (url) => {
        fallbackUrl = url;
        return {
          html: await fixture("search-empty.html"),
          status: 200,
          url,
          method: "playwright",
        };
      },
    });

    await expect(loader("FAG713618870")).resolves.toMatchObject({
      method: "playwright",
    });
    expect(new URL(fallbackUrl).searchParams.get("article")).toBe(
      "FAG713618870",
    );
  });
});
