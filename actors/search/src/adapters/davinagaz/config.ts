import { z } from "zod";

const DavinagazTransportConfigSchema = z.object({
  DAVINAGAZ_BASE_URL: z.url().default("https://davinagaz.by/"),
  DAVINAGAZ_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)"),
  DAVINAGAZ_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(10_000),
  DAVINAGAZ_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(1_500),
  DAVINAGAZ_PLAYWRIGHT_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DAVINAGAZ_PLAYWRIGHT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(60_000)
    .default(25_000),
  DAVINAGAZ_RESULT_LIMIT: z.coerce.number().int().min(1).max(50).default(30),
});

export type DavinagazTransportConfig = z.infer<
  typeof DavinagazTransportConfigSchema
>;

export function readDavinagazTransportConfig(
  environment: Record<string, string | undefined> = process.env,
): DavinagazTransportConfig {
  return DavinagazTransportConfigSchema.parse(environment);
}
