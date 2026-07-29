import { Actor } from "apify";
import { SearchRequestSchema } from "@autoradar/domain";
import { z } from "zod";

import { Auto1PartsAdapter } from "./adapters/auto1";
import { MockPartsAdapter } from "./adapters/mock";
import { MotorlandPartsAdapter } from "./adapters/motorland";
import { RemzonaPartsAdapter } from "./adapters/remzona";
import type { PartsSourceAdapter } from "./adapters/types";
import { ZapPartsAdapter } from "./adapters/zap";
import { runFederatedSearch } from "./federated-search";

const ActorInputSchema = SearchRequestSchema.extend({
  sources: z
    .array(z.enum(["auto1", "motorland", "remzona", "zap", "mock"]))
    .default(["motorland"]),
});

await Actor.main(async () => {
  const input = ActorInputSchema.parse(await Actor.getInput());
  const adapters: PartsSourceAdapter[] = [];

  if (input.sources.includes("auto1")) {
    adapters.push(new Auto1PartsAdapter());
  }
  if (input.sources.includes("motorland")) {
    adapters.push(new MotorlandPartsAdapter());
  }
  if (input.sources.includes("remzona")) {
    adapters.push(new RemzonaPartsAdapter());
  }
  if (input.sources.includes("zap")) {
    adapters.push(new ZapPartsAdapter());
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
