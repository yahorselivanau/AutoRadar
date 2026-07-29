import "server-only";

import type { GuestUsage } from "@autoradar/domain";

import type { RequestIdentity } from "@/lib/auth/identity";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const GUEST_SEARCH_LIMIT = positiveIntegerEnv(
  "GUEST_SEARCH_LIMIT_24H",
  5,
);
export const GUEST_AI_REQUEST_LIMIT = positiveIntegerEnv(
  "GUEST_AI_REQUEST_LIMIT_24H",
  5,
);

export type UsageEventType =
  "conversation_created" | "assistant_turn" | "search_started";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const memoryUsageEvents: Array<{
  sessionIdHash: string;
  eventType: UsageEventType;
  createdAt: number;
}> = [];

function windowStart(now = new Date()): string {
  return new Date(now.getTime() - WINDOW_MS).toISOString();
}

function resetAt(now = new Date()): string {
  return new Date(now.getTime() + WINDOW_MS).toISOString();
}

async function countEvents(
  identity: Extract<RequestIdentity, { kind: "guest" }>,
  eventType: UsageEventType,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const start = Date.now() - WINDOW_MS;
    return memoryUsageEvents.filter(
      (event) =>
        event.sessionIdHash === identity.sessionIdHash &&
        event.eventType === eventType &&
        event.createdAt >= start,
    ).length;
  }
  const { count, error } = await admin
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("session_id_hash", identity.sessionIdHash)
    .eq("event_type", eventType)
    .gte("created_at", windowStart());
  if (error) throw error;
  return count ?? 0;
}

export async function getGuestUsage(
  identity: RequestIdentity,
): Promise<GuestUsage | null> {
  if (identity.kind === "user") return null;
  const [requestsUsed, searchesUsed] = await Promise.all([
    countEvents(identity, "assistant_turn"),
    countEvents(identity, "search_started"),
  ]);
  return {
    requestsUsed,
    requestsLimit: GUEST_AI_REQUEST_LIMIT,
    searchesUsed,
    searchesLimit: GUEST_SEARCH_LIMIT,
    resetsAt: resetAt(),
  };
}

export async function assertGuestQuota(
  identity: RequestIdentity,
  eventType: UsageEventType,
): Promise<void> {
  if (identity.kind === "user") return;
  const limits: Partial<Record<UsageEventType, number>> = {
    assistant_turn: GUEST_AI_REQUEST_LIMIT,
    search_started: GUEST_SEARCH_LIMIT,
  };
  const limit = limits[eventType];
  if (!limit) return;
  const used = await countEvents(identity, eventType);
  if (used >= limit) {
    const error = new Error("guest_quota_exceeded");
    error.name = "GuestQuotaError";
    throw error;
  }
}

export async function recordUsageEvent({
  identity,
  eventType,
  conversationId,
  searchJobId,
}: {
  identity: RequestIdentity;
  eventType: UsageEventType;
  conversationId?: string;
  searchJobId?: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    if (identity.kind === "guest") {
      memoryUsageEvents.push({
        sessionIdHash: identity.sessionIdHash,
        eventType,
        createdAt: Date.now(),
      });
    }
    return;
  }
  const { error } = await admin.from("usage_events").insert({
    user_id: identity.kind === "user" ? identity.userId : null,
    session_id_hash: identity.kind === "guest" ? identity.sessionIdHash : null,
    event_type: eventType,
    conversation_id: conversationId ?? null,
    search_job_id: searchJobId ?? null,
  });
  if (error) throw error;
}
