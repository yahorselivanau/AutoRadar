import { NormalizedOfferSchema, SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import { applyStructuredMatchEvidence } from "./match-evidence";

const request = SearchRequestSchema.parse({
  query: "OX 339/2D",
  part: {
    name: "Масляный фильтр",
    rawPartNumber: "OX 339/2D",
    normalizedPartNumber: "OX3392D",
  },
});

function offer(rawPartNumber: string) {
  return NormalizedOfferSchema.parse({
    sourceId: "armtek",
    externalId: rawPartNumber,
    externalUrl: "https://example.com/offer",
    title: "Масляный фильтр",
    rawPartNumber,
    condition: "new",
    partKind: "unknown",
    currency: "BYN",
    fetchedAt: "2026-07-30T12:00:00.000Z",
    rawPayloadHash: "0".repeat(64),
  });
}

describe("applyStructuredMatchEvidence", () => {
  it("confirms only a normalized structured article match", () => {
    const matched = applyStructuredMatchEvidence(offer("OX339/2D"), request);

    expect(matched.matchStatus).toBe("confirmed");
    expect(matched.matchEvidence).toEqual({
      kind: "structured_article",
      requestedNormalizedArticle: "OX3392D",
      offeredNormalizedArticle: "OX3392D",
    });
  });

  it("downgrades a claimed confirmation without structured evidence", () => {
    const mismatched = applyStructuredMatchEvidence(
      { ...offer("OX339/3D"), matchStatus: "confirmed" },
      request,
    );

    expect(mismatched.matchStatus).toBe("possible");
  });
});
