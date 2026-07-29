import { describe, expect, it } from "vitest";

import {
  ConversationStateSchema,
  GarageStateSchema,
  GuestUsageSchema,
  maskVin,
  NormalizedOfferSchema,
  SearchJobResultSchema,
  SearchRequestSchema,
  VinSchema,
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
      rawPayloadHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(offer.priceAmount).toBe("125.50");
  });

  it("normalizes, validates and masks a VIN", () => {
    const vin = VinSchema.parse("vf3lbbhzhes123456");

    expect(vin).toBe("VF3LBBHZHES123456");
    expect(maskVin(vin)).toBe("VF3••••••••••3456");
    expect(VinSchema.safeParse("VF3I123").success).toBe(false);
  });

  it("accepts an empty persistent garage without mock vehicles", () => {
    expect(GarageStateSchema.parse({})).toEqual({
      vehicles: [],
      activeVehicleId: null,
    });
  });

  it("keeps conversation memory and persisted search results structured", () => {
    const request = SearchRequestSchema.parse({
      query: "Капот BMW 3 F30",
      vehicle: { make: "BMW", model: "3", year: 2016, generation: "F30" },
      part: { name: "Капот", condition: "used" },
    });
    const state = ConversationStateSchema.parse({ searchDraft: request });
    const job = SearchJobResultSchema.parse({
      jobId: "29c8c193-e65c-4a87-bbc3-69bff51cfe69",
      status: "completed",
      offers: [],
      sources: [
        {
          sourceId: "motorland",
          status: "empty",
          offerCount: 0,
          durationMs: 120,
          errorMessage: null,
        },
      ],
      clarification: null,
    });

    expect(state.searchDraft?.vehicle?.generation).toBe("F30");
    expect(job.sources[0]?.status).toBe("empty");
  });

  it("validates guest quota counters without treating messages as searches", () => {
    const usage = GuestUsageSchema.parse({
      requestsUsed: 4,
      requestsLimit: 5,
      searchesUsed: 4,
      searchesLimit: 5,
      resetsAt: "2026-07-30T12:00:00.000Z",
    });

    expect(usage.requestsLimit - usage.requestsUsed).toBe(1);
    expect(usage.searchesLimit - usage.searchesUsed).toBe(1);
  });
});
