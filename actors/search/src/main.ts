import { SearchRequestSchema } from "@autoradar/domain";

import { MockPartsAdapter } from "./adapters/mock";

const request = SearchRequestSchema.parse({
  query: "Стеклоподъёмник Peugeot 308",
  vehicle: { make: "Peugeot", model: "308", year: 2008 },
  part: { name: "Стеклоподъёмник", side: "left", position: "front" },
});

const result = await new MockPartsAdapter().search(request);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
