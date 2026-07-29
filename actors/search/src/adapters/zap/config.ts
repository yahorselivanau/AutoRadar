import { z } from "zod";

const ZapTransportConfigSchema = z.object({
  ZAP_BASE_URL: z.url().default("https://zap.by/"),
  ZAP_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)"),
  ZAP_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(10_000),
  ZAP_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(60_000)
    .default(500),
  ZAP_RESULT_LIMIT: z.coerce.number().int().min(1).max(100).default(50),
});

export type ZapTransportConfig = z.infer<typeof ZapTransportConfigSchema>;

export function readZapTransportConfig(
  environment: Record<string, string | undefined> = process.env,
): ZapTransportConfig {
  return ZapTransportConfigSchema.parse(environment);
}
