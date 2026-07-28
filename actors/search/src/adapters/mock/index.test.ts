import { describe, expect, it } from "vitest";

import { SearchRequestSchema } from "@autoradar/domain";

import { MockPartsAdapter } from "./index";

describe("MockPartsAdapter", () => {
  it("returns normalized offers without network access", async () => {
    const adapter = new MockPartsAdapter();
    const result = await adapter.search(
      SearchRequestSchema.parse({
        query: "Стеклоподъёмник Peugeot 308",
        vehicle: { make: "Peugeot", model: "308", year: 2008 },
        part: { name: "Стеклоподъёмник", side: "left", position: "front" },
      }),
    );

    expect(result.method).toBe("mock");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.currency).toBe("BYN");
  });
});
