import { z } from "zod";

const Auto1TransportConfigSchema = z.object({
  AUTO1_BASE_URL: z.url().default("https://auto1.by/"),
  AUTO1_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)"),
  AUTO1_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(10_000),
  AUTO1_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(60_000)
    .default(1_000),
  AUTO1_RESULT_LIMIT: z.coerce.number().int().min(1).max(50).default(30),
});

export type Auto1TransportConfig = z.infer<typeof Auto1TransportConfigSchema>;

export function readAuto1TransportConfig(
  environment: Record<string, string | undefined> = process.env,
): Auto1TransportConfig {
  return Auto1TransportConfigSchema.parse(environment);
}
