import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import type { PartsSourceAdapter } from "./adapters/types";
import { planSourceSearch } from "./search-plan";

function adapter(
  id: "armtek" | "motorland" | "zap",
  capabilities: PartsSourceAdapter["capabilities"],
): PartsSourceAdapter {
  return {
    id,
    capabilities,
    async search() {
      return { method: "http", offers: [] };
    },
  };
}

describe("planSourceSearch", () => {
  const newArticle = adapter("armtek", {
    article: true,
    vehicleCatalog: false,
    vin: false,
    text: true,
    category: true,
    conditions: ["new"],
  });
  const usedVehicle = adapter("motorland", {
    article: false,
    vehicleCatalog: true,
    vin: false,
    text: true,
    category: false,
    conditions: ["used"],
  });
  const vehicleOnlyNew = adapter("zap", {
    article: false,
    vehicleCatalog: true,
    vin: false,
    text: false,
    category: false,
    conditions: ["new"],
  });

  it("keeps an article unchanged and falls back to the source's supported mode", () => {
    const input = SearchRequestSchema.parse({
      query: "Найди OX 339/2D",
      part: {
        name: "Масляный фильтр",
        rawPartNumber: "OX 339/2D",
        normalizedPartNumber: "OX3392D",
        condition: "new",
      },
    });
    const plan = planSourceSearch(input, [
      newArticle,
      usedVehicle,
      vehicleOnlyNew,
    ]);

    expect(plan.entries[0]).toMatchObject({
      sourceId: "armtek",
      strategy: "article",
      query: "OX 339/2D",
    });
    expect(plan.entries[1]?.strategy).toBe("skip");
    expect(plan.entries[2]?.skipReason).toContain("подходящий режим");
  });

  it("uses a vehicle catalogue when an article-only mode is unavailable", () => {
    const input = SearchRequestSchema.parse({
      query: "Капот BMW 3 41617037432",
      vehicle: { make: "BMW", model: "3" },
      part: {
        name: "Капот",
        rawPartNumber: "41617037432",
        normalizedPartNumber: "41617037432",
        condition: "used",
      },
    });

    expect(planSourceSearch(input, [usedVehicle]).entries[0]).toMatchObject({
      strategy: "vehicle_catalog",
      query: "Капот BMW 3",
      skipReason: null,
    });
  });

  it("uses a vehicle catalogue only when make and model are known", () => {
    const input = SearchRequestSchema.parse({
      query: "Капот BMW 3",
      vehicle: { make: "BMW", model: "3" },
      part: { name: "Капот", condition: "used" },
    });

    expect(planSourceSearch(input, [usedVehicle]).entries[0]).toMatchObject({
      strategy: "vehicle_catalog",
      query: "Капот BMW 3",
    });
  });
});
