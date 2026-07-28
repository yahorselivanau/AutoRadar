import { Actor } from "apify";
import { SearchRequestSchema } from "@autoradar/domain";
import { z } from "zod";

import { MockPartsAdapter } from "./adapters/mock";
import { RemzonaPartsAdapter } from "./adapters/remzona";
import type { PartsSourceAdapter } from "./adapters/types";
import { runFederatedSearch } from "./federated-search";

const ActorInputSchema = SearchRequestSchema.extend({
  sources: z.array(z.enum(["remzona", "mock"])).default(["remzona"]),
});

await Actor.main(async () => {
  const input = ActorInputSchema.parse(await Actor.getInput());
  const adapters: PartsSourceAdapter[] = [];

  if (input.sources.includes("remzona")) {
    adapters.push(new RemzonaPartsAdapter());
  }
  if (input.sources.includes("mock")) {
    adapters.push(new MockPartsAdapter());
  }

  const result = await runFederatedSearch(input, adapters);
  await Actor.pushData({
    type: "federated-search-result",
    ...result,
  });
  await Actor.setValue("OUTPUT", result);
  await Actor.setStatusMessage(
    `Источников: ${result.sources.length}; предложений: ${result.offers.length}`,
  );
});
