import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { getMotorlandQuery, MotorlandPartsAdapter } from ".";
import type { MotorlandTransportConfig } from "./config";
import { createMotorlandSearchLoader } from "./loader";
import { normalizeMotorlandPrice, parseMotorlandSearchHtml } from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: MotorlandTransportConfig = {
  MOTORLAND_BASE_URL: "https://motorland.by/",
  MOTORLAND_USER_AGENT: "AutoRadar test",
  MOTORLAND_HTTP_TIMEOUT_MS: 3_000,
  MOTORLAND_REQUEST_INTERVAL_MS: 250,
  MOTORLAND_RESULT_LIMIT: 30,
};

const request = SearchRequestSchema.parse({
  query: "Капот BMW 3 F30",
  vehicle: { make: "BMW", model: "3", year: 2016, generation: "F30" },
  part: { name: "Капот", condition: "used" },
});

describe("Motorland parser", () => {
  it("normalizes verified SSR cards as used BYN offers", async () => {
    const offers = parseMotorlandSearchHtml(
      await fixture("search-success.html"),
      "2026-07-29T00:00:00.000Z",
    );

    expect(normalizeMotorlandPrice("1 305,50 р.")).toBe("1305.50");
    expect(normalizeMotorlandPrice("725.000")).toBe("725");
    expect(normalizeMotorlandPrice("725.125")).toBeUndefined();
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      sourceId: "motorland",
      externalId: "21361901",
      externalUrl:
        "https://motorland.by/auto-parts/bmw/3/f30-2012-2019/kapot/sku-21361901/",
      title: "Капот BMW 3 F30 2012-2019",
      brand: "BMW",
      rawPartNumber: "21361901",
      condition: "used",
      partKind: "unknown",
      priceAmount: "725",
      priceSource: "data_attribute",
      deliveryText: "Доставка по РБ",
      compatibilityText: "2016 · Седан · КПП 6-ст.мех.(МКПП) · B38B15A",
    });
  });

  it("returns an empty list for the verified no-results page", async () => {
    expect(
      parseMotorlandSearchHtml(await fixture("search-empty.html")),
    ).toEqual([]);
  });

  it("reports a selector change instead of a false empty success", () => {
    expect(() =>
      parseMotorlandSearchHtml(
        '<ul class="grid-new"><li class="new-grid__item"></li></ul>',
      ),
    ).toThrow("DOM_CHANGED");
  });
});

describe("Motorland adapter", () => {
  it("builds the observed free-text query and filters related categories", async () => {
    expect(getMotorlandQuery(request)).toBe("Капот BMW 3 F30");
    const adapter = new MotorlandPartsAdapter(
      async () => ({
        html: await fixture("search-success.html"),
        status: 200,
        url: "https://motorland.by/auto-parts/?Filter.TextSearch=...",
      }),
      30,
    );

    const result = await adapter.search(request);

    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(2);
  });

  it("does not query a used-only source for a new-only request", async () => {
    const loader = vi.fn();
    const adapter = new MotorlandPartsAdapter(loader, 30);

    await expect(
      adapter.search(
        SearchRequestSchema.parse({
          query: "Капот BMW",
          part: { name: "Капот", condition: "new" },
        }),
      ),
    ).resolves.toEqual({ method: "html", offers: [] });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("Motorland public HTTP search", () => {
  it("uses the observed Filter.TextSearch parameter without cookies", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    const loader = createMotorlandSearchLoader({
      config,
      fetchImpl: async (request, init) => {
        requestedUrl = request.toString();
        requestedHeaders = init?.headers;
        return new Response(await fixture("search-empty.html"), {
          status: 200,
        });
      },
    });

    await loader("Капот BMW 3 F30");

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/auto-parts/");
    expect(url.searchParams.get("Filter.TextSearch")).toBe("Капот BMW 3 F30");
    expect(new Headers(requestedHeaders).has("cookie")).toBe(false);
  });

  it("maps the observed rate-limit page to a typed error", async () => {
    const loader = createMotorlandSearchLoader({
      config,
      fetchImpl: async () =>
        new Response(await fixture("search-error.html"), { status: 429 }),
    });

    await expect(loader("Капот BMW")).rejects.toMatchObject({
      sourceId: "motorland",
      code: "rate-limited",
    });
  });
});
