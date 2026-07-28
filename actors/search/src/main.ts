import { SearchRequestSchema } from "@autoradar/domain";

import { MockPartsAdapter } from "./adapters/mock";
import { RemzonaPartsAdapter } from "./adapters/remzona";
import { runFederatedSearch } from "./federated-search";

const request = SearchRequestSchema.parse({
  query: "7700274177",
  part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
});

const adapters = [
  new MockPartsAdapter(),
  ...(process.env.SOURCE_REMZONA_ENABLED === "true"
    ? [new RemzonaPartsAdapter()]
    : []),
];
const result = await runFederatedSearch(request, adapters);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
