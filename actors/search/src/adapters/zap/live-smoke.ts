import { SearchRequestSchema } from "@autoradar/domain";

import { ZapPartsAdapter } from ".";

if (process.env.ZAP_LIVE_SMOKE !== "true") {
  process.stderr.write(
    'Zap.by live smoke выключен. Запуск: ZAP_LIVE_SMOKE=true pnpm zap:smoke -- PEUGEOT 308 2008 "Стеклоподъемник" left front 5\n',
  );
  process.exit(0);
}

const [
  make = "AUDI",
  model = "A4",
  rawYear = "2010",
  partName = "Масляный фильтр",
  side = "unknown",
  position = "unknown",
  rawDoors,
] = process.argv.slice(2).filter((value) => value !== "--");
const doors = rawDoors ? Number(rawDoors) : undefined;

const request = SearchRequestSchema.parse({
  query: `${partName} ${make} ${model}`,
  vehicle: {
    make,
    model,
    year: Number(rawYear),
  },
  part: {
    name: partName,
    side,
    position,
    constraints: doors ? [{ key: "doorCount", value: String(doors) }] : [],
  },
});

const result = await new ZapPartsAdapter().search(request);
process.stdout.write(
  `${JSON.stringify(
    {
      method: result.method,
      offers: result.offers.length,
      clarification: result.clarification,
      sample: result.offers.slice(0, 3),
    },
    null,
    2,
  )}\n`,
);
