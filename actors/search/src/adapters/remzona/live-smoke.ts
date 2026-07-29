import { SearchRequestSchema } from "@autoradar/domain";

import { RemzonaPartsAdapter } from ".";

if (process.env.REMZONA_LIVE_SMOKE !== "true") {
  process.stdout.write(
    "Remzona live smoke выключен. Запуск: REMZONA_LIVE_SMOKE=true pnpm remzona:smoke -- стеклоподъемник\n",
  );
  process.exit(0);
}

const query =
  process.argv
    .slice(2)
    .filter((value) => value !== "--")
    .join(" ")
    .trim() || "стеклоподъемник";
const result = await new RemzonaPartsAdapter().search(
  SearchRequestSchema.parse({
    query,
    part: {
      name: query,
      rawPartNumber: /\d/.test(query) ? query : undefined,
    },
  }),
);

process.stdout.write(
  `${JSON.stringify(
    {
      method: result.method,
      offers: result.offers.map((offer) => ({
        title: offer.title,
        brand: offer.brand,
        partNumber: offer.rawPartNumber,
        price: offer.priceAmount,
        priceSource: offer.priceSource,
        url: offer.externalUrl,
      })),
    },
    null,
    2,
  )}\n`,
);
