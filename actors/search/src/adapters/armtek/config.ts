import { z } from "zod";

const ArmtekTransportConfigSchema = z.object({
  ARMTEK_BASE_URL: z.url().default("https://armtek.by/"),
  ARMTEK_GUEST_AUTH_TOKEN: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  ARMTEK_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
  ARMTEK_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(12_000),
  ARMTEK_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(1_500),
  ARMTEK_RESULT_LIMIT: z.coerce.number().int().min(1).max(50).default(30),
});

export type ArmtekTransportConfig = z.infer<typeof ArmtekTransportConfigSchema>;

export function readArmtekTransportConfig(
  environment: Record<string, string | undefined> = process.env,
): ArmtekTransportConfig {
  return ArmtekTransportConfigSchema.parse(environment);
}
