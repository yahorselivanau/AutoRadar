import { describe, expect, it } from "vitest";

import {
  NormalizedOfferSchema,
  SearchRequestSchema,
  normalizePartNumber,
} from "./index";

describe("domain schemas", () => {
  it("normalizes OEM numbers without changing the source value", () => {
    expect(normalizePartNumber("98-123 456/80")).toBe("9812345680");
  });

  it("accepts a conversational parts request", () => {
    const result = SearchRequestSchema.parse({
      query: "Передний левый стеклоподъёмник на Peugeot 308 2008",
      vehicle: { make: "Peugeot", model: "308", year: 2008 },
      part: {
        name: "Стеклоподъёмник",
        side: "left",
        position: "front",
      },
    });

    expect(result.currency).toBe("BYN");
    expect(result.locale).toBe("ru-BY");
  });

  it("keeps money as a decimal string", () => {
    const offer = NormalizedOfferSchema.parse({
      sourceId: "mock",
      externalId: "mock-1",
      externalUrl: "https://example.com/offer/mock-1",
      title: "Стеклоподъёмник передний левый",
      condition: "used",
      partKind: "original",
      priceAmount: "125.50",
      currency: "BYN",
      fetchedAt: "2026-07-28T12:00:00.000Z",
    });

    expect(offer.priceAmount).toBe("125.50");
  });
});
