import { SearchRequestSchema } from "@autoradar/domain";

import { ZapPartsAdapter } from ".";

if (process.env.ZAP_LIVE_SMOKE !== "true") {
  process.stderr.write(
    'Zap.by live smoke выключен. Запуск: ZAP_LIVE_SMOKE=true pnpm zap:smoke -- AUDI A4 2010 "Масляный фильтр"\n',
  );
  process.exit(0);
}

const [
  make = "AUDI",
  model = "A4",
  rawYear = "2010",
  partName = "Масляный фильтр",
] = process.argv.slice(2).filter((value) => value !== "--");

const request = SearchRequestSchema.parse({
  query: `${partName} ${make} ${model}`,
  vehicle: {
    make,
    model,
    year: Number(rawYear),
  },
  part: { name: partName },
});

const result = await new ZapPartsAdapter().search(request);
process.stdout.write(
  `${JSON.stringify(
    {
      method: result.method,
      offers: result.offers.length,
      sample: result.offers.slice(0, 3),
    },
    null,
    2,
  )}\n`,
);
