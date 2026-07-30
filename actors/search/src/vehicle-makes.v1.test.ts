import { describe, expect, it } from "vitest";

import { canonicalVehicleMake, vehicleMakesMatch } from "./vehicle-makes.v1";

describe("vehicle make aliases", () => {
  it.each([
    ["Пежо", "PEUGEOT"],
    ["БМВ", "BMW"],
    ["Фольксваген", "VOLKSWAGEN"],
    ["Хендай", "HYUNDAI"],
    ["Мерседес", "MERCEDES-BENZ"],
    ["Ситроён", "CITROEN"],
    ["ВАЗ", "LADA"],
    ["Джили", "GEELY"],
    ["Мицубиси", "MITSUBISHI"],
    ["Шевроле", "CHEVROLET"],
  ])("matches %s with %s", (localized, canonical) => {
    expect(vehicleMakesMatch(localized, canonical)).toBe(true);
    expect(canonicalVehicleMake(localized)).toBe(canonical);
  });

  it("does not guess an unknown make", () => {
    expect(canonicalVehicleMake("Rare Motors")).toBe("Rare Motors");
    expect(vehicleMakesMatch("Rare Motors", "rare-motors")).toBe(true);
  });
});
