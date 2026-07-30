import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import { normalizeSearchRequest } from "./request-normalizer";

describe("normalizeSearchRequest", () => {
  it("performs technical cleanup without reinterpreting user semantics", () => {
    const result = normalizeSearchRequest(
      SearchRequestSchema.parse({
        query: "  нужна   левая граната на Пежо 308  ",
        vehicle: { make: "Пежо", model: " 308 ", year: 2008 },
        part: {
          name: "граната",
          side: "left",
          constraints: [{ key: "mounting", value: "  наружный   шлиц  " }],
        },
      }),
    );

    expect(result).toMatchObject({
      query: "нужна левая граната на Пежо 308",
      vehicle: { make: "PEUGEOT", model: "308", year: 2008 },
      part: {
        name: "граната",
        side: "left",
        constraints: [{ key: "mounting", value: "наружный шлиц" }],
      },
    });
  });

  it("normalizes an article only when AI or deterministic intent supplied it", () => {
    const result = normalizeSearchRequest(
      SearchRequestSchema.parse({
        query: "найди OEM 1K0-959-801",
        part: {
          name: "мотор стеклоподъёмника",
          rawPartNumber: "1K0-959-801",
        },
      }),
    );

    expect(result.part).toMatchObject({
      rawPartNumber: "1K0-959-801",
      normalizedPartNumber: "1K0959801",
    });
  });

  it("does not turn a VIN or conversational wording into guessed fields", () => {
    const result = normalizeSearchRequest(
      SearchRequestSchema.parse({
        query: "машина VF3LBBHZHES123456, нужна стойка с мотором",
        part: { name: "стойка" },
      }),
    );

    expect(result.part).toMatchObject({
      name: "стойка",
      side: "unknown",
      position: "unknown",
      condition: "any",
      constraints: [],
    });
    expect(result.part.rawPartNumber).toBeUndefined();
  });
});
