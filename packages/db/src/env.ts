import { z } from "zod";

export const serverDatabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
});

export type ServerDatabaseEnv = z.infer<typeof serverDatabaseEnvSchema>;
