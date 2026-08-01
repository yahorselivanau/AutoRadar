import { SearchRequestSchema } from "@autoradar/domain";

import { Auto1PartsAdapter } from ".";

if (process.env.AUTO1_LIVE_SMOKE !== "true") {
  process.stdout.write(
    "Auto1 live smoke is disabled. Set AUTO1_LIVE_SMOKE=true to allow one public search request.\n",
  );
  process.exit(0);
}

const query =
  process.argv.slice(2).filter((arg) => arg !== "--").join(" ").trim() ||
  "Масляный фильтр";
const request = SearchRequestSchema.parse({
  query,
  part: { name: query, condition: "new" },
});
const result = await new Auto1PartsAdapter().search(request);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
