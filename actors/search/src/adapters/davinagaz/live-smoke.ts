import { SearchRequestSchema } from "@autoradar/domain";

import { DavinagazPartsAdapter } from ".";

if (process.env.DAVINAGAZ_LIVE_SMOKE !== "true") {
  process.stderr.write(
    'Davinagaz live smoke выключен. Запуск: DAVINAGAZ_LIVE_SMOKE=true pnpm davinagaz:smoke -- "FAG713618870"\n',
  );
  process.exit(0);
}

const [article = "FAG713618870"] = process.argv
  .slice(2)
  .filter((value) => value !== "--");
const request = SearchRequestSchema.parse({
  query: article,
  part: { name: "Автозапчасть", rawPartNumber: article },
});
const result = await new DavinagazPartsAdapter().search(request);
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
