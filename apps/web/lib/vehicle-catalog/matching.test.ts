import { describe, expect, it } from "vitest";

import {
  normalizeVehicleCatalogText,
  selectVehicleCatalogMatches,
  type VehicleCatalogModel,
} from "./matching";

const models: VehicleCatalogModel[] = [
  {
    id: 1,
    makeId: 1,
    name: "308 I",
    nameNormalized: "308 I",
    generation: "4A_, 4C_",
    yearFrom: 2007,
    yearTo: 2016,
  },
  {
    id: 2,
    makeId: 1,
    name: "308 SW I",
    nameNormalized: "308 SW I",
    generation: "4E_, 4H_",
    yearFrom: 2007,
    yearTo: 2014,
  },
  {
    id: 3,
    makeId: 1,
    name: "308 II",
    nameNormalized: "308 II",
    generation: "LB_, LP_",
    yearFrom: 2013,
    yearTo: 2021,
  },
];

describe("vehicle catalog matching", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeVehicleCatalogText("Citroën / Benz")).toBe("CITROEN BENZ");
  });

  it("filters model variants by year", () => {
    const matches = selectVehicleCatalogMatches({
      models,
      model: "308",
      year: 2008,
    });
    expect(matches.map((match) => match.id)).toEqual([1, 2]);
  });

  it("resolves an explicit generation label", () => {
    const matches = selectVehicleCatalogMatches({
      models,
      model: "308",
      year: 2008,
      generation: "308 I (4A_, 4C_)",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.label).toBe("308 I (4A_, 4C_)");
  });

  it("keeps catalog rows with unknown years eligible", () => {
    const matches = selectVehicleCatalogMatches({
      models: [
        {
          id: 4,
          makeId: 1,
          name: "100 C1 купе",
          nameNormalized: "100 C1 КУПЕ",
          generation: "817",
        },
      ],
      model: "100 C1",
      year: 1985,
    });
    expect(matches).toHaveLength(1);
  });
});
