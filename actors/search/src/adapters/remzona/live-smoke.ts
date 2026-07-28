import { SearchRequestSchema } from "@autoradar/domain";

import { RemzonaPartsAdapter } from ".";

const query = process.argv.slice(2).join(" ").trim() || "7700274177";
const result = await new RemzonaPartsAdapter().search(
  SearchRequestSchema.parse({
    query,
    part: {
      name: query,
      rawPartNumber: query,
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
        url: offer.externalUrl,
      })),
    },
    null,
    2,
  )}\n`,
);
