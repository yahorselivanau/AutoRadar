import { describe, expect, it } from "vitest";

import { readPublicSupabaseConfig, readSupabaseSecretKey } from "./config";

describe("readPublicSupabaseConfig", () => {
  it("normalizes a valid hosted Supabase configuration", () => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: " https://project.supabase.co/ ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          " sb_publishable_test-public-key ",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      key: "sb_publishable_test-public-key",
    });
  });

  it("allows local HTTP development", () => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_local-development-key",
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      key: "sb_publishable_local-development-key",
    });
  });

  it.each([
    ["missing URL", undefined, "sb_publishable_key"],
    ["missing key", "https://project.supabase.co", undefined],
    ["legacy key", "https://project.supabase.co", "legacy-anon-key"],
    ["malformed URL", "project.supabase.co", "sb_publishable_key"],
    ["insecure remote URL", "http://project.supabase.co", "sb_publishable_key"],
  ])("rejects %s", (_label, url, key) => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toBeNull();
  });
});

describe("readSupabaseSecretKey", () => {
  it("accepts only a modern Supabase secret key", () => {
    expect(
      readSupabaseSecretKey({
        SUPABASE_SECRET_KEY: " sb_secret_server-key ",
      }),
    ).toBe("sb_secret_server-key");
  });

  it.each([undefined, "", "sb_publishable_public-key", "legacy-service-role"])(
    "rejects a non-secret key",
    (key) => {
      expect(
        readSupabaseSecretKey({
          SUPABASE_SECRET_KEY: key,
        }),
      ).toBeNull();
    },
  );
});
