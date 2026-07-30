import { SearchRequestSchema } from "@autoradar/domain";

import { ArmtekPartsAdapter } from ".";

if (process.env.ARMTEK_LIVE_SMOKE !== "true") {
  process.stdout.write(
    'Armtek live smoke выключен. Запуск: ARMTEK_LIVE_SMOKE=true ARMTEK_GUEST_AUTH_TOKEN="<server-only value>" pnpm armtek:smoke -- "7700274177"\n',
  );
  process.exit(0);
}

const query =
  process.argv
    .slice(2)
    .filter((argument) => argument !== "--")
    .join(" ")
    .trim() || "7700274177";
const request = SearchRequestSchema.parse({
  query,
  part: {
    name: query,
    rawPartNumber: /^[a-z0-9./_-]+$/i.test(query) ? query : undefined,
    condition: "new",
  },
});
const result = await new ArmtekPartsAdapter().search(request);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
