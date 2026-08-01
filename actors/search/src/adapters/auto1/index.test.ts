import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import {
  Auto1PartsAdapter,
  evaluateAuto1Offer,
  findAuto1Brand,
  findAuto1Group,
  getAuto1Query,
  resolveAuto1Engine,
  resolveAuto1Model,
} from ".";
import type { Auto1TransportConfig } from "./config";
import { createAuto1ChallengeSolver } from "./hg-security";
import { createAuto1CatalogLoader, createAuto1SearchLoader } from "./loader";
import {
  parseAuto1Brands,
  parseAuto1Engines,
  parseAuto1Groups,
  parseAuto1Models,
  parseAuto1SearchHtml,
} from "./parser";

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
      async () => ({
        html: "",
        status: 200,
        url: "https://auto1.by/auto",
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
    const adapter = new Auto1PartsAdapter(
      loader,
      async () => ({ html: "", status: 200, url: "https://auto1.by/auto" }),
      30,
    );
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

describe("Auto1 vehicle catalog ladder", () => {
  it("parses brands, models, engines and groups from SSR pages", async () => {
    const brands = parseAuto1Brands(await fixture("catalog-brands.html"));
    expect(brands).toContainEqual(
      expect.objectContaining({
        manufId: "16",
        name: "BMW",
        aliases: expect.arrayContaining(["bmw", "бмв"]),
      }),
    );

    const models = parseAuto1Models(await fixture("catalog-models.html"));
    expect(models).toContainEqual(
      expect.objectContaining({
        modelId: "9618",
        title: "207 седан",
        yearFrom: "2007",
        yearTo: "2014",
      }),
    );

    const engines = parseAuto1Engines(
      await fixture("catalog-engines.html"),
    );
    expect(engines).toContainEqual(
      expect.objectContaining({
        engineId: "108259",
        volume: "1.6",
        powerKw: "81 kw (110 hp)",
        engineCode: "EP6",
        fuel: "Бензин",
      }),
    );

    const groups = parseAuto1Groups(await fixture("catalog-groups.html"));
    expect(groups).toContainEqual(
      expect.objectContaining({ groupId: "100492", label: "Масляный насос" }),
    );
  });

  it("resolves a canonical make via data-search aliases", async () => {
    const brands = parseAuto1Brands(await fixture("catalog-brands.html"));
    expect(findAuto1Brand(brands, "PEUGEOT")?.manufId).toBe("88");
    expect(findAuto1Brand(brands, "BMW")?.manufId).toBe("16");
    expect(findAuto1Brand(brands, "Пежо")).toBeDefined();
    expect(findAuto1Brand(brands, "LAMBORGHINI")?.manufId).toBe("701");
  });

  it("resolves a model by name and year window", async () => {
    const models = parseAuto1Models(await fixture("catalog-models.html"));
    const resolved = resolveAuto1Model(models, "207 седан", 2008);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.modelId).toBe("9618");
    expect(resolveAuto1Model(models, "207", 2012)).toHaveLength(2);
  });

  it("resolves an engine by volume, code and year", async () => {
    const engines = parseAuto1Engines(
      await fixture("catalog-engines.html"),
    );
    expect(resolveAuto1Engine(engines, "1.6", 2010)[0]?.engineId).toBe(
      "108259",
    );
    expect(resolveAuto1Engine(engines, "EP6", 2010)[0]?.engineId).toBe(
      "108259",
    );
  });

  it("matches the part name to a leaf group", async () => {
    const groups = parseAuto1Groups(await fixture("catalog-groups.html"));
    expect(findAuto1Group(groups, "Масляный насос")?.groupId).toBe("100492");
    expect(findAuto1Group(groups, "Масляный фильтр")?.groupId).toBe("100470");
  });

  it("walks the ladder and returns catalog offers", async () => {
    const requests: string[] = [];
    const adapter = new Auto1PartsAdapter(
      async () => ({ html: "", status: 200, url: "" }),
      async (path) => {
        requests.push(path);
        const name =
          path === "/auto"
            ? "catalog-brands.html"
            : path === "/auto/88"
              ? "catalog-models.html"
              : path === "/auto/88/9618"
                ? "catalog-engines.html"
                : path === "/auto/88/9618/108259"
                  ? "catalog-groups.html"
                  : path.includes("groupId=100470")
                    ? "search-success.html"
                    : "search-empty.html";
        return {
          html: await fixture(name),
          status: 200,
          url: `https://auto1.by${path}`,
        };
      },
      30,
    );

    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "Масляный фильтр Peugeot 207 2008",
        vehicle: {
          make: "Peugeot",
          model: "207 седан",
          year: 2008,
          engine: "1.6",
        },
        part: { name: "Масляный фильтр", condition: "new" },
      }),
    );

    expect(requests).toEqual([
      "/auto",
      "/auto/88",
      "/auto/88/9618",
      "/auto/88/9618/108259",
      "/auto/88/9618/108259?groupId=100470",
    ]);
    expect(result.method).toBe("html");
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers[0]).toMatchObject({
      externalId: "315677",
      matchStatus: "possible",
    });
  });

  it("asks to clarify the engine when several match", async () => {
    const adapter = new Auto1PartsAdapter(
      async () => ({ html: "", status: 200, url: "" }),
      async (path) => {
        const name =
          path === "/auto"
            ? "catalog-brands.html"
            : path === "/auto/88"
              ? "catalog-models.html"
              : "catalog-engines.html";
        return {
          html: await fixture(name),
          status: 200,
          url: `https://auto1.by${path}`,
        };
      },
      30,
    );

    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "Масляный насос Peugeot 207 2008",
        vehicle: { make: "Peugeot", model: "207 седан", year: 2008 },
        part: { name: "Масляный насос", condition: "new" },
      }),
    );

    expect(result.clarification?.field).toBe("engine");
    expect(result.clarification?.options.length).toBeGreaterThan(1);
    expect(result.offers).toEqual([]);
  });

  it("falls back to /Search when the catalog misses the make", async () => {
    const catalogRequests: string[] = [];
    let searchQuery = "";
    const adapter = new Auto1PartsAdapter(
      async (query) => {
        searchQuery = query;
        return {
          html: await fixture("search-success.html"),
          status: 200,
          url: "https://auto1.by/Search?pattern=...",
        };
      },
      async (path) => {
        catalogRequests.push(path);
        return {
          html: await fixture("catalog-brands.html"),
          status: 200,
          url: `https://auto1.by${path}`,
        };
      },
      30,
    );

    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "Масляный фильтр Bentley Continental",
        vehicle: { make: "Bentley", model: "Continental", year: 2021 },
        part: { name: "Масляный фильтр", condition: "new" },
      }),
    );

    expect(catalogRequests).toEqual(["/auto"]);
    expect(searchQuery).toContain("Масляный фильтр");
    expect(result.offers.length).toBeGreaterThan(0);
  });
});

describe("Auto1 catalog HTTP loader", () => {
  it("requests only robots-allowed public catalog paths", async () => {
    const requested: string[] = [];
    const loader = createAuto1CatalogLoader({
      config,
      fetchImpl: async (url) => {
        requested.push(url.toString());
        return new Response(await fixture("search-empty.html"), {
          status: 200,
        });
      },
    });

    await loader("/auto/88/9618/108259?groupId=100470");
    expect(requested[0]).toBe(
      "https://auto1.by/auto/88/9618/108259?groupId=100470",
    );

    await expect(loader("/search/admin")).rejects.toMatchObject({
      code: "unsupported-query",
    });
    await expect(loader("/auto/88?groupId=100470")).rejects.toMatchObject({
      code: "unsupported-query",
    });
    expect(requested).toHaveLength(1);
  });
});

describe("Auto1 hg-security challenge solver", () => {
  it("extracts the cookie value embedded in the observed verification page", async () => {
    const solver = createAuto1ChallengeSolver();
    const headers = await solver.solve(await fixture("search-verification.html"));
    expect(headers).toEqual({ Cookie: "hg-security=fixture" });
    expect(solver.cookieHeader()).toEqual({ Cookie: "hg-security=fixture" });
  });

  it("extracts the cookie from the real challenge script shape", async () => {
    const solver = createAuto1ChallengeSolver();
    const headers = await solver.solve(
      'let c="hg-security=LpYcedZA9xnKRgVv1ueYibL24l4G3xSblDEWitXtSNOFDuK_IxUjl3nnR2lNUGd3G_KAP1Dj8_Nqlu3ldfDFtZN-Nz2Hnms=; path=/; max-age=120";location.reload();',
    );
    expect(headers).toEqual({
      Cookie: "hg-security=LpYcedZA9xnKRgVv1ueYibL24l4G3xSblDEWitXtSNOFDuK_IxUjl3nnR2lNUGd3G_KAP1Dj8_Nqlu3ldfDFtZN-Nz2Hnms=",
    });
  });

  it("ignores pages without an embedded hg-security cookie", async () => {
    const solver = createAuto1ChallengeSolver();
    await expect(solver.solve("<html><body>ok</body></html>")).resolves.toBeUndefined();
    expect(solver.cookieHeader()).toBeUndefined();
  });

  it("forgets the cookie after its TTL", async () => {
    vi.useFakeTimers();
    try {
      const solver = createAuto1ChallengeSolver(60_000);
      await solver.solve(await fixture("search-verification.html"));
      vi.advanceTimersByTime(61_000);
      expect(solver.cookieHeader()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Auto1 challenge retry", () => {
  it("retries the same request with the hg-security cookie and returns real data", async () => {
    const requests: string[] = [];
    const cookies: (string | null)[] = [];
    const loader = createAuto1SearchLoader({
      config,
      solver: createAuto1ChallengeSolver(),
      fetchImpl: async (url, init) => {
        requests.push(url.toString());
        cookies.push(new Headers(init?.headers).get("cookie"));
        const html =
          requests.length === 1
            ? await fixture("search-verification.html")
            : await fixture("search-success.html");
        return new Response(html, { status: 200 });
      },
    });

    const result = await loader("OX339/2D");

    expect(requests).toHaveLength(2);
    expect(cookies[0]).toBeNull();
    expect(cookies[1]).toBe("hg-security=fixture");
    expect(result.html).toContain("MAHLE ORIGINAL");
    expect(result.status).toBe(200);
  });

  it("reuses the solved cookie for later requests without waiting for a challenge", async () => {
    const cookies: (string | null)[] = [];
    const solver = createAuto1ChallengeSolver();
    await solver.solve(await fixture("search-verification.html"));

    const loader = createAuto1SearchLoader({
      config,
      solver,
      fetchImpl: async (_url, init) => {
        cookies.push(new Headers(init?.headers).get("cookie"));
        return new Response(await fixture("search-empty.html"), { status: 200 });
      },
    });

    await loader("Масляный фильтр");

    expect(cookies).toEqual(["hg-security=fixture"]);
  });

  it("still reports a typed block when the challenge cannot be solved", async () => {
    const loader = createAuto1SearchLoader({
      config,
      solver: {
        solve: async () => undefined,
        cookieHeader: () => undefined,
      },
      fetchImpl: async () =>
        new Response(await fixture("search-verification.html"), { status: 200 }),
    });

    await expect(loader("OX339/2D")).rejects.toMatchObject({
      sourceId: "auto1",
      code: "blocked",
      message: expect.stringContaining("HTTP_BLOCKED"),
    });
  });
});
