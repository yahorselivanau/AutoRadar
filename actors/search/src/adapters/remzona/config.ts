import { z } from "zod";

const RemzonaTransportConfigSchema = z.object({
  REMZONA_BASE_URL: z.url().default("https://remzona.by/"),
  REMZONA_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
  REMZONA_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(10_000),
  REMZONA_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(5_000),
  REMZONA_PLAYWRIGHT_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type RemzonaTransportConfig = z.infer<
  typeof RemzonaTransportConfigSchema
>;

export function readRemzonaTransportConfig(
  environment: Record<string, string | undefined> = process.env,
): RemzonaTransportConfig {
  return RemzonaTransportConfigSchema.parse(environment);
}
