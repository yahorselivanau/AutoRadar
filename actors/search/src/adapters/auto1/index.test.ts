import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { Auto1PartsAdapter, evaluateAuto1Offer, getAuto1Query } from ".";
import type { Auto1TransportConfig } from "./config";
import { createAuto1SearchLoader } from "./loader";
import { parseAuto1SearchHtml } from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: Auto1TransportConfig = {
  AUTO1_BASE_URL: "https://auto1.by/",
  AUTO1_USER_AGENT: "AutoRadar test",
  AUTO1_HTTP_TIMEOUT_MS: 3_000,
  AUTO1_REQUEST_INTERVAL_MS: 250,
  AUTO1_RESULT_LIMIT: 30,
};

const request = SearchRequestSchema.parse({
  query: "Масляный фильтр Peugeot 207 2008",
  vehicle: { make: "Peugeot", model: "207", year: 2008 },
  part: { name: "Масляный фильтр", condition: "new" },
});

describe("Auto1 parser", () => {
  it("normalizes verified SSR microdata without executing page scripts", async () => {
    const offers = parseAuto1SearchHtml(
      await fixture("search-success.html"),
      "2026-07-29T00:00:00.000Z",
    );

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      sourceId: "auto1",
      externalId: "315677",
      externalUrl: "https://auto1.by/avtozapchasti/dvigatel/315677",
      title: "MAHLE ORIGINAL OX339/2D",
      brand: "MAHLE ORIGINAL",
      rawPartNumber: "OX339/2D",
      normalizedPartNumber: "OX3392D",
      condition: "new",
      partKind: "unknown",
      priceAmount: "10.45",
      priceSource: "microdata",
      currency: "BYN",
      availability: "В наличии · >10 шт",
      location: "Минск, ул. Бабушкина, д.27а",
      sellerName: "Auto1.by",
    });
  });

  it("returns an empty list for a no-card page", async () => {
    expect(parseAuto1SearchHtml(await fixture("search-empty.html"))).toEqual(
      [],
    );
  });

  it("reports a selector change instead of a false empty success", () => {
    expect(() =>
      parseAuto1SearchHtml(
        '<div class="catalog-list"><div class="catalog-list-card"></div></div>',
      ),
    ).toThrow("DOM_CHANGED");
  });

  it("accepts a numeric product URL under a robots-allowed catalogue root", () => {
    const [offer] = parseAuto1SearchHtml(`
      <div class="catalog-list"><div class="catalog-list-card">
        <a class="link-name" href="/Oil/filters/315677">MAHLE OX339/2D</a>
        <span data-articleid="315677"></span>
        <div itemprop="offers">
          <meta itemprop="price" content="10.45">
          <meta itemprop="priceCurrency" content="BYN">
        </div>
      </div></div>
    `);
    expect(offer?.externalUrl).toBe("https://auto1.by/Oil/filters/315677");
  });
});

describe("Auto1 adapter", () => {
  it("builds a structured text query and excludes unrelated catalog cards", async () => {
    expect(getAuto1Query(request)).toBe("Масляный фильтр Peugeot 207 2008");
    const adapter = new Auto1PartsAdapter(
      async () => ({
        html: await fixture("search-success.html"),
        status: 200,
        url: "https://auto1.by/Search?pattern=...",
      }),
      30,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      externalId: "315677",
      matchStatus: "possible",
      matchReasons: ["Название детали присутствует в карточке Auto1.by"],
    });
  });

  it("matches a supplied article exactly and skips used-only searches", async () => {
    const parsed = parseAuto1SearchHtml(await fixture("search-success.html"));
    const oilFilter = parsed[0]!;
    const articleRequest = SearchRequestSchema.parse({
      query: "OX339/2D",
      part: {
        name: "Масляный фильтр",
        rawPartNumber: "OX339/2D",
      },
    });

    expect(evaluateAuto1Offer(oilFilter, articleRequest)).toBeDefined();
    expect(getAuto1Query(articleRequest)).toBe("OX339/2D");

    const loader = vi.fn();
    const adapter = new Auto1PartsAdapter(loader, 30);
    await expect(
      adapter.search(
        SearchRequestSchema.parse({
          query: "Капот б/у",
          part: { name: "Капот", condition: "used" },
        }),
      ),
    ).resolves.toEqual({ method: "html", offers: [] });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("Auto1 public HTTP search", () => {
  it("uses the observed GET /Search pattern parameter without cookies", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    const loader = createAuto1SearchLoader({
      config,
      fetchImpl: async (url, init) => {
        requestedUrl = url.toString();
        requestedHeaders = init?.headers;
        return new Response(await fixture("search-empty.html"), {
          status: 200,
        });
      },
    });

    await loader("Масляный фильтр Peugeot");

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/Search");
    expect(url.searchParams.get("pattern")).toBe("Масляный фильтр Peugeot");
    expect(new Headers(requestedHeaders).has("cookie")).toBe(false);
  });

  it("maps a rate-limit page to a typed error", async () => {
    const loader = createAuto1SearchLoader({
      config,
      fetchImpl: async () =>
        new Response(await fixture("search-error.html"), { status: 429 }),
    });

    await expect(loader("Масляный фильтр")).rejects.toMatchObject({
      sourceId: "auto1",
      code: "rate-limited",
    });
  });

  it("does not mistake the observed JavaScript verification page for empty results", async () => {
    const loader = createAuto1SearchLoader({
      config,
      fetchImpl: async () =>
        new Response(await fixture("search-verification.html"), {
          status: 200,
        }),
    });

    await expect(loader("OX339/2D")).rejects.toMatchObject({
      sourceId: "auto1",
      code: "blocked",
      message: expect.stringContaining("HTTP_BLOCKED"),
    });
  });
});
