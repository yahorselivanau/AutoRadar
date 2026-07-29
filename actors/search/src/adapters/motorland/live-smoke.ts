import { SearchRequestSchema } from "@autoradar/domain";

import { MotorlandPartsAdapter } from ".";

if (process.env.MOTORLAND_LIVE_SMOKE !== "true") {
  process.stderr.write(
    'Motorland live smoke выключен. Запуск: MOTORLAND_LIVE_SMOKE=true pnpm motorland:smoke -- BMW 3 2016 "Капот" F30\n',
  );
  process.exit(0);
}

const [
  make = "BMW",
  model = "3",
  rawYear = "2016",
  partName = "Капот",
  generation = "F30",
] = process.argv.slice(2).filter((value) => value !== "--");
const request = SearchRequestSchema.parse({
  query: `${partName} ${make} ${model} ${generation}`,
  vehicle: { make, model, year: Number(rawYear), generation },
  part: { name: partName, condition: "used" },
});
const result = await new MotorlandPartsAdapter().search(request);
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
