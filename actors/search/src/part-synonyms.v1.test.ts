import { describe, expect, it } from "vitest";

import {
  canonicalizePartName,
  PART_SYNONYMS_VERSION,
  sourcePartQuery,
} from "./part-synonyms.v1";

describe(PART_SYNONYMS_VERSION, () => {
  it("normalizes only fixture-backed static synonyms", () => {
    expect(canonicalizePartName("дворники")).toBe("щётка стеклоочистителя");
    expect(canonicalizePartName("неизвестная деталь")).toBe(
      "неизвестная деталь",
    );
  });

  it("uses a source variant without changing the canonical card", () => {
    expect(sourcePartQuery("механизм стеклоподъёмника", "remzona")).toBe(
      "стеклоподъемник",
    );
  });
});
