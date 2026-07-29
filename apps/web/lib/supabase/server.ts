import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { readPublicSupabaseConfig, readSupabaseSecretKey } from "./config";

export function getPublicSupabaseConfig() {
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
  return Boolean(getPublicSupabaseConfig());
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getPublicSupabaseConfig() && getSecretKey());
}

export async function createSupabaseServerClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can read cookies but cannot write them. The
          // Supabase proxy refreshes and persists sessions before render.
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const config = getPublicSupabaseConfig();
  const secretKey = getSecretKey();
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
