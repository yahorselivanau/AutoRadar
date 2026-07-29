import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { readPublicSupabaseConfig, readSupabaseSecretKey } from "./config";

function getPublicConfig() {
  return readPublicSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

function getSecretKey() {
  return readSupabaseSecretKey({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(getPublicConfig());
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getPublicConfig() && getSecretKey());
}

export async function createSupabaseServerClient() {
  const config = getPublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const config = getPublicConfig();
  const secretKey = getSecretKey();
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
