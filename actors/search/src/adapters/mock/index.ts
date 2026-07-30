import { NormalizedOfferSchema, type SearchRequest } from "@autoradar/domain";

import type { AdapterResult, PartsSourceAdapter } from "../types";

const fixtureTimestamp = "2026-07-28T12:00:00.000Z";

export class MockPartsAdapter implements PartsSourceAdapter {
  readonly id = "mock";
  readonly capabilities = {
    article: true,
    vehicleCatalog: true,
    vin: false,
    text: true,
    category: true,
    conditions: ["new", "used"],
  } as const;

  async search(input: SearchRequest): Promise<AdapterResult> {
    const title = `${input.part.name} ${input.vehicle?.make ?? ""} ${
      input.vehicle?.model ?? ""
    }`.trim();

    return {
      method: "mock",
      offers: [
        NormalizedOfferSchema.parse({
          sourceId: "mock",
          externalId: "mock-original-used",
          externalUrl: "https://example.com/mock-original-used",
          title,
          brand: input.vehicle?.make,
          condition: "used",
          partKind: "original",
          priceAmount: "125.00",
          currency: "BYN",
          availability: "В наличии",
          location: "Минск",
          sellerName: "Демонстрационный продавец",
          compatibilityText: "Совместимость требует проверки у продавца",
          fetchedAt: fixtureTimestamp,
          rawPayloadHash:
            "0000000000000000000000000000000000000000000000000000000000000000",
        }),
      ],
    };
  }
}
