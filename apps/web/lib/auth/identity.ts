import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const GUEST_COOKIE = "autoradar_guest";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type RequestIdentity =
  | { kind: "user"; userId: string; trackingId: string }
  | { kind: "guest"; sessionIdHash: string; trackingId: string };

function signingSecret(): string {
  const secret =
    process.env.ANON_SESSION_SECRET ?? process.env.SEARCH_JOB_SIGNING_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ANON_SESSION_SECRET is not configured.");
  }
  return "autoradar-local-development-only";
}

function signature(value: string): string {
  return createHmac("sha256", signingSecret())
    .update(value)
    .digest("base64url");
}

function parseSignedSession(value: string | undefined): string | null {
  if (!value) return null;
  const [sessionId, providedSignature] = value.split(".");
  if (!sessionId || !providedSignature) return null;
  const expected = Buffer.from(signature(sessionId));
  const provided = Buffer.from(providedSignature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }
  return sessionId;
}

function hashSession(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function readGuestSessionHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionId = parseSignedSession(cookieStore.get(GUEST_COOKIE)?.value);
  return sessionId ? hashSession(sessionId) : null;
}

export async function resolveRequestIdentity(): Promise<RequestIdentity> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (user) {
      return {
        kind: "user",
        userId: user.id,
        trackingId: `user:${user.id}`,
      };
    }
  }

  const cookieStore = await cookies();
  const current = parseSignedSession(cookieStore.get(GUEST_COOKIE)?.value);
  const sessionId = current ?? randomUUID();

  if (!current) {
    cookieStore.set(GUEST_COOKIE, `${sessionId}.${signature(sessionId)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
    });
  }

  const sessionIdHash = hashSession(sessionId);
  return {
    kind: "guest",
    sessionIdHash,
    trackingId: `guest:${sessionIdHash.slice(0, 24)}`,
  };
}
