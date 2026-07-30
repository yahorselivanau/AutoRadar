import { SearchRequestSchema } from "@autoradar/domain";

import { ArmtekPartsAdapter } from "./adapters/armtek";
import { Auto1PartsAdapter } from "./adapters/auto1";
import { MockPartsAdapter } from "./adapters/mock";
import { MotorlandPartsAdapter } from "./adapters/motorland";
import { RemzonaPartsAdapter } from "./adapters/remzona";
import { ZapPartsAdapter } from "./adapters/zap";
import { runFederatedSearch } from "./federated-search";

const request = SearchRequestSchema.parse({
  query: "7700274177",
  part: { name: "Масляный фильтр", rawPartNumber: "7700274177" },
});

const adapters = [
  new MockPartsAdapter(),
  ...(process.env.SOURCE_ARMTEK_ENABLED === "true"
    ? [new ArmtekPartsAdapter()]
    : []),
  ...(process.env.SOURCE_AUTO1_ENABLED === "true"
    ? [new Auto1PartsAdapter()]
    : []),
  ...(process.env.SOURCE_MOTORLAND_ENABLED === "true"
    ? [new MotorlandPartsAdapter()]
    : []),
  ...(process.env.SOURCE_REMZONA_ENABLED === "true"
    ? [new RemzonaPartsAdapter()]
    : []),
  ...(process.env.SOURCE_ZAP_ENABLED === "true" ? [new ZapPartsAdapter()] : []),
];
const result = await runFederatedSearch(request, adapters);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
