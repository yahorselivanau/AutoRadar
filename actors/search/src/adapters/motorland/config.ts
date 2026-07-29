import { z } from "zod";

const MotorlandTransportConfigSchema = z.object({
  MOTORLAND_BASE_URL: z.url().default("https://motorland.by/"),
  MOTORLAND_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default("AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)"),
  MOTORLAND_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(3_000)
    .max(30_000)
    .default(10_000),
  MOTORLAND_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(60_000)
    .default(1_000),
  MOTORLAND_RESULT_LIMIT: z.coerce.number().int().min(1).max(50).default(30),
});

export type MotorlandTransportConfig = z.infer<
  typeof MotorlandTransportConfigSchema
>;

export function readMotorlandTransportConfig(
  environment: Record<string, string | undefined> = process.env,
): MotorlandTransportConfig {
  return MotorlandTransportConfigSchema.parse(environment);
}
