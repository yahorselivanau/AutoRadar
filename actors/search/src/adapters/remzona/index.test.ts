import { readFile } from "node:fs/promises";

import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it, vi } from "vitest";

import { AdapterError } from "../types";
import { RemzonaPartsAdapter } from ".";
import type { RemzonaTransportConfig } from "./config";
import { createRemzonaHtmlLoader } from "./loader";
import { parseRemzonaSearchHtml } from "./parser";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: RemzonaTransportConfig = {
  REMZONA_BASE_URL: "https://remzona.by/",
  REMZONA_USER_AGENT: "AutoRadar test",
  REMZONA_HTTP_TIMEOUT_MS: 3_000,
  REMZONA_REQUEST_INTERVAL_MS: 1_000,
};

describe("Remzona HTML parser", () => {
  it("normalizes verified public search cards without inferring price or OEM", async () => {
    const html = await fixture("search-success.html");
    const offers = parseRemzonaSearchHtml(html, "2026-07-28T19:52:34.000Z");

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      sourceId: "remzona",
      externalId: "renault/7700274177",
      externalUrl: "https://remzona.by/renault/7700274177",
      title: "7700274177 - Масляный фильтр",
      brand: "RENAULT",
      rawPartNumber: "7700274177",
      normalizedPartNumber: "7700274177",
      oemNumbers: [],
      condition: "unknown",
      partKind: "unknown",
      currency: "BYN",
      sellerName: "Remzona.by",
    });
    expect(offers[0]?.priceAmount).toBeUndefined();
  });

  it("handles an empty public search response", async () => {
    expect(parseRemzonaSearchHtml(await fixture("search-empty.html"))).toEqual(
      [],
    );
  });
});

describe("Remzona adapter", () => {
  it("searches by the original part number", async () => {
    const html = await fixture("search-success.html");
    const loader = vi.fn(async () => ({ html, status: 200 }));
    const adapter = new RemzonaPartsAdapter(loader);

    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "7700-274-177",
        part: {
          name: "Масляный фильтр",
          rawPartNumber: "7700-274-177",
          normalizedPartNumber: "7700274177",
        },
      }),
    );

    expect(loader).toHaveBeenCalledWith("7700-274-177");
    expect(result.method).toBe("html");
    expect(result.offers).toHaveLength(2);
  });
});

describe("Remzona HTTP loader", () => {
  it("reproduces the verified public XHR contract", async () => {
    let capturedUrl: URL | RequestInfo | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof globalThis.fetch = vi.fn(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response("", { status: 200 });
      },
    );
    const loader = createRemzonaHtmlLoader({ config, fetchImpl });

    await loader("7700274177");

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(capturedUrl).toBe("https://remzona.by/");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.body?.toString()).toBe(
      "typerequest=search&q=7700274177",
    );
  });

  it("returns a typed rate-limit error for the observed 429 page", async () => {
    const html = await fixture("search-error.html");
    const loader = createRemzonaHtmlLoader({
      config,
      fetchImpl: async () => new Response(html, { status: 429 }),
    });

    await expect(loader("7700274177")).rejects.toMatchObject({
      sourceId: "remzona",
      code: "rate-limited",
    } satisfies Partial<AdapterError>);
  });
});
