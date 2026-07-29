import "server-only";

import {
  ConversationStateSchema,
  type ConversationState,
  type GuestUsage,
} from "@autoradar/domain";
import type { UIMessage } from "ai";

import type { RequestIdentity } from "@/lib/auth/identity";
import {
  assertGuestQuota,
  getGuestUsage,
  recordUsageEvent,
} from "@/lib/auth/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type ConversationRecord = {
  id: string;
  title: string;
  updatedAt: string;
  messages: UIMessage[];
  state: ConversationState;
  guestUsage: GuestUsage | null;
};

type MemoryConversation = Omit<ConversationRecord, "guestUsage"> & {
  owner: string;
};

const memoryConversations = new Map<string, MemoryConversation>();

function ownerKey(identity: RequestIdentity): string {
  return identity.kind === "user"
    ? `user:${identity.userId}`
    : `guest:${identity.sessionIdHash}`;
}

function ownerColumns(identity: RequestIdentity) {
  return {
    user_id: identity.kind === "user" ? identity.userId : null,
    session_id_hash: identity.kind === "guest" ? identity.sessionIdHash : null,
  };
}

function ownsRow(
  row: { user_id: string | null; session_id_hash: string | null },
  identity: RequestIdentity,
): boolean {
  return identity.kind === "user"
    ? row.user_id === identity.userId
    : row.session_id_hash === identity.sessionIdHash;
}

export async function createConversation(
  identity: RequestIdentity,
): Promise<ConversationRecord> {
  await assertGuestQuota(identity, "conversation_created");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const state = ConversationStateSchema.parse({});
  const admin = createSupabaseAdminClient();

  if (admin) {
    const { error: conversationError } = await admin
      .from("conversations")
      .insert({ id, title: "Новый поиск", ...ownerColumns(identity) });
    if (conversationError) throw conversationError;
    const { error: stateError } = await admin
      .from("conversation_states")
      .insert({ conversation_id: id });
    if (stateError) throw stateError;
  } else {
    memoryConversations.set(id, {
      id,
      owner: ownerKey(identity),
      title: "Новый поиск",
      updatedAt: now,
      messages: [],
      state,
    });
  }

  await recordUsageEvent({
    identity,
    eventType: "conversation_created",
    conversationId: id,
  });

  return {
    id,
    title: "Новый поиск",
    updatedAt: now,
    messages: [],
    state,
    guestUsage: await getGuestUsage(identity),
  };
}

export async function loadConversation(
  id: string,
  identity: RequestIdentity,
): Promise<ConversationRecord | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const conversation = memoryConversations.get(id);
    if (!conversation || conversation.owner !== ownerKey(identity)) return null;
    return {
      ...conversation,
      guestUsage: await getGuestUsage(identity),
    };
  }

  const { data: conversation, error } = await admin
    .from("conversations")
    .select("id,title,updated_at,user_id,session_id_hash")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!conversation || !ownsRow(conversation, identity)) return null;

  const [{ data: messageRows, error: messagesError }, stateResult] =
    await Promise.all([
      admin
        .from("messages")
        .select("id,role,parts")
        .eq("conversation_id", id)
        .order("position", { ascending: true }),
      admin
        .from("conversation_states")
        .select(
          "active_vehicle,search_draft,latest_search_job_id,latest_search_summary",
        )
        .eq("conversation_id", id)
        .maybeSingle(),
    ]);
  if (messagesError) throw messagesError;
  if (stateResult.error) throw stateResult.error;

  const state = ConversationStateSchema.parse({
    activeVehicle: stateResult.data?.active_vehicle ?? null,
    searchDraft: stateResult.data?.search_draft ?? null,
    latestSearchJobId: stateResult.data?.latest_search_job_id ?? null,
    latestSearchSummary: stateResult.data?.latest_search_summary ?? null,
  });

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updated_at,
    messages: (messageRows ?? []).map((row) => ({
      id: row.id,
      role: row.role as UIMessage["role"],
      parts: row.parts as UIMessage["parts"],
    })),
    state,
    guestUsage: await getGuestUsage(identity),
  };
}

export async function saveConversationMessages({
  identity,
  conversationId,
  messages,
  model,
  promptVersion,
}: {
  identity: RequestIdentity;
  conversationId: string;
  messages: UIMessage[];
  model: string;
  promptVersion: string;
}) {
  const existing = await loadConversation(conversationId, identity);
  if (!existing) throw new Error("conversation_not_found");
  const now = new Date().toISOString();
  const title =
    messages
      .find((message) => message.role === "user")
      ?.parts.find((part) => part.type === "text")
      ?.text.trim()
      .slice(0, 72) || existing.title;
  const admin = createSupabaseAdminClient();

  if (!admin) {
    memoryConversations.set(conversationId, {
      id: conversationId,
      owner: ownerKey(identity),
      title,
      updatedAt: now,
      messages,
      state: existing.state,
    });
    return;
  }

  const rows = messages.map((message, position) => ({
    id: message.id,
    conversation_id: conversationId,
    position,
    role: message.role,
    parts: message.parts,
    model: message.role === "assistant" ? model : null,
    prompt_version: message.role === "assistant" ? promptVersion : null,
  }));
  if (rows.length > 0) {
    const { error } = await admin
      .from("messages")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  const { error: conversationError } = await admin
    .from("conversations")
    .update({ title, updated_at: now })
    .eq("id", conversationId);
  if (conversationError) throw conversationError;
}

export async function saveConversationState({
  identity,
  conversationId,
  state,
}: {
  identity: RequestIdentity;
  conversationId: string;
  state: ConversationState;
}) {
  const parsed = ConversationStateSchema.parse(state);
  const existing = await loadConversation(conversationId, identity);
  if (!existing) throw new Error("conversation_not_found");
  const admin = createSupabaseAdminClient();
  if (!admin) {
    memoryConversations.set(conversationId, {
      ...memoryConversations.get(conversationId)!,
      state: parsed,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const { error } = await admin.from("conversation_states").upsert({
    conversation_id: conversationId,
    active_vehicle: parsed.activeVehicle,
    search_draft: parsed.searchDraft,
    latest_search_job_id: parsed.latestSearchJobId,
    latest_search_summary: parsed.latestSearchSummary,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function listConversations(identity: RequestIdentity) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return [...memoryConversations.values()]
      .filter((conversation) => conversation.owner === ownerKey(identity))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  let query = admin
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  query =
    identity.kind === "user"
      ? query.eq("user_id", identity.userId)
      : query.eq("session_id_hash", identity.sessionIdHash);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

export async function claimGuestData(sessionIdHash: string, userId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;

  const ownerUpdate = { user_id: userId, session_id_hash: null };
  for (const table of [
    "conversations",
    "search_requests",
    "search_jobs",
    "usage_events",
  ] as const) {
    const { error } = await admin
      .from(table)
      .update(ownerUpdate)
      .eq("session_id_hash", sessionIdHash);
    if (error) throw error;
  }
}
