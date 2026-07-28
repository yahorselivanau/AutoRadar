import { SearchRequestSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import { AdapterError, type PartsSourceAdapter } from "./adapters/types";
import { runFederatedSearch } from "./federated-search";

const input = SearchRequestSchema.parse({
  query: "0130822368",
  part: { name: "Стеклоподъемник", rawPartNumber: "0130822368" },
});

describe("runFederatedSearch", () => {
  it("isolates a source error and preserves successful sources", async () => {
    const success: PartsSourceAdapter = {
      id: "success",
      async search() {
        return { method: "html", offers: [] };
      },
    };
    const timeout: PartsSourceAdapter = {
      id: "timeout",
      async search() {
        throw new AdapterError("timeout", "timeout", "source timeout");
      },
    };

    const result = await runFederatedSearch(input, [success, timeout]);

    expect(result.sources).toEqual([
      { sourceId: "success", method: "html", offers: [] },
      {
        sourceId: "timeout",
        offers: [],
        error: { code: "timeout", message: "source timeout" },
      },
    ]);
  });
});
