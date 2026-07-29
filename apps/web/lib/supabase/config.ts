export type PublicSupabaseConfig = {
  url: string;
  key: string;
};

export function readPublicSupabaseConfig(
  env: Partial<
    Record<
      "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      string | undefined
    >
  >,
): PublicSupabaseConfig | null {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key?.startsWith("sb_publishable_")) return null;

  try {
    const url = new URL(rawUrl);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;

    return {
      url: url.toString().replace(/\/$/, ""),
      key,
    };
  } catch {
    return null;
  }
}

export function readSupabaseSecretKey(
  env: Partial<Record<"SUPABASE_SECRET_KEY", string | undefined>>,
): string | null {
  const key = env.SUPABASE_SECRET_KEY?.trim();
  return key?.startsWith("sb_secret_") ? key : null;
}
