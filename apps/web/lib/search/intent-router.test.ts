import { describe, expect, it } from "vitest";

import { classifySearchIntent, findVinInText } from "./intent-router";
import { INTENT_GOLDEN_V1 } from "./fixtures/intent-golden.v1";

describe("classifySearchIntent", () => {
  it.each([
    ["Найди OX339/2D", "OX3392D"],
    ["Найди OX 339/2D", "OX3392D"],
    ["артикул: 98-123 456/80", "9812345680"],
    ["OEM 1K0-959-801", "1K0959801"],
  ])("recognizes an article before invoking AI: %s", (text, normalized) => {
    const intent = classifySearchIntent(text);
    expect(intent.mode).toBe("part_number");
    expect(intent.normalizedPartNumber).toBe(normalized);
  });

  it("extracts and normalizes a VIN without exposing it as an article", () => {
    const vin = findVinInText("Моя машина vf3lbbhzhes123456");
    const intent = classifySearchIntent(vin!);

    expect(vin).toBe("VF3LBBHZHES123456");
    expect(intent.vin).toBe(vin);
    expect(intent.rawPartNumber).toBeUndefined();
  });

  it.each([
    ["Слышу моторчик, но стекло не поднимается", "symptom"],
    ["горит ошибка P0420", "symptom"],
    ["нужно моторное масло", "consumable"],
    ["ищу коврики в салон", "accessory"],
    ["передний левый рычаг Peugeot 308", "vehicle_part"],
  ] as const)("routes %s as %s", (text, mode) => {
    expect(classifySearchIntent(text).mode).toBe(mode);
  });

  it("passes the versioned 100-case deterministic intent corpus", () => {
    expect(INTENT_GOLDEN_V1).toHaveLength(100);
    for (const scenario of INTENT_GOLDEN_V1) {
      expect(classifySearchIntent(scenario.text).mode, scenario.id).toBe(
        scenario.expectedMode,
      );
    }
  });
});
