import { describe, expect, it } from "vitest";

import { assessSymptomSafety } from "./symptom-safety";

describe("assessSymptomSafety", () => {
  it.each([
    "провалилась педаль тормоза",
    "пахнет бензином и течёт топливо",
    "двигатель перегрелся и кипит антифриз",
    "ошибка высоковольтной батареи",
  ])("stops unsafe diagnostic instructions for: %s", (text) => {
    expect(assessSymptomSafety(text).severity).toBe("stop_driving");
  });

  it("does not block a non-critical comfort-system symptom", () => {
    expect(
      assessSymptomSafety("моторчик слышно, но стекло не поднимается"),
    ).toEqual({ severity: "none", message: null, matchedArea: null });
  });
});
