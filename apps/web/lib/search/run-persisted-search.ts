import "server-only";

import { createHash } from "node:crypto";

import {
  SearchJobResultSchema,
  SearchRequestSchema,
  type NormalizedOffer,
  type SearchClarification,
  type SearchJobResult,
  type SearchJobSourceStatus,
  type SearchRequest,
  type SourceId,
} from "@autoradar/domain";
import { Auto1PartsAdapter } from "@autoradar/search-actor/auto1";
import { MotorlandPartsAdapter } from "@autoradar/search-actor/motorland";
import { RemzonaPartsAdapter } from "@autoradar/search-actor/remzona";
import type {
  AdapterResult,
  PartsSourceAdapter,
} from "@autoradar/search-actor/types";
import { AdapterError } from "@autoradar/search-actor/types";
import { ZapPartsAdapter } from "@autoradar/search-actor/zap";

import type { RequestIdentity } from "@/lib/auth/identity";
import { assertGuestQuota, recordUsageEvent } from "@/lib/auth/quota";
import { loadConversation, saveConversationState } from "@/lib/chat/store";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdapterRun = {
  sourceId: SourceId;
  status: SearchJobSourceStatus;
  durationMs: number;
  offers: NormalizedOffer[];
  clarification: SearchClarification | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const memorySearches = new Map<
  string,
  SearchJobResult & {
    owner: string;
    conversationId: string;
    idempotencyKey: string;
  }
>();

function ownerKey(identity: RequestIdentity) {
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

function enabledAdapters(): Array<{
  sourceId: SourceId;
  adapter: PartsSourceAdapter;
}> {
  return [
    ...(process.env.SOURCE_ZAP_ENABLED === "false"
      ? []
      : [{ sourceId: "zap" as const, adapter: new ZapPartsAdapter() }]),
    ...(process.env.SOURCE_MOTORLAND_ENABLED === "false"
      ? []
      : [
          {
            sourceId: "motorland" as const,
            adapter: new MotorlandPartsAdapter(),
          },
        ]),
    ...(process.env.SOURCE_AUTO1_ENABLED === "false"
      ? []
      : [{ sourceId: "auto1" as const, adapter: new Auto1PartsAdapter() }]),
    ...(process.env.SOURCE_REMZONA_ENABLED === "true"
      ? [
          {
            sourceId: "remzona" as const,
            adapter: new RemzonaPartsAdapter(),
          },
        ]
      : []),
  ];
}

function idempotencyKey(conversationId: string, input: SearchRequest): string {
  return createHash("sha256")
    .update(`${conversationId}:${JSON.stringify(input)}`)
    .digest("hex");
}

function deduplicateOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = `${offer.sourceId}:${offer.externalId}:${offer.externalUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runAdapter(
  sourceId: SourceId,
  adapter: PartsSourceAdapter,
  input: SearchRequest,
): Promise<AdapterRun> {
  const startedAt = Date.now();
  try {
    const result: AdapterResult = await adapter.search(input);
    return {
      sourceId,
      status: result.offers.length > 0 ? "completed" : "empty",
      durationMs: Date.now() - startedAt,
      offers: result.offers,
      clarification: result.clarification ?? null,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const code = error instanceof AdapterError ? error.code : "unknown";
    const status: SearchJobSourceStatus =
      code === "timeout"
        ? "timeout"
        : code === "blocked"
          ? "blocked"
          : "failed";
    return {
      sourceId,
      status,
      durationMs: Date.now() - startedAt,
      offers: [],
      clarification: null,
      errorCode: code,
      errorMessage:
        error instanceof Error ? error.message : "Источник не ответил.",
    };
  }
}

function summarize(offers: NormalizedOffer[], runs: AdapterRun[]) {
  const prices = offers
    .map((offer) => offer.priceAmount)
    .filter((price): price is string => Boolean(price))
    .map(Number)
    .filter(Number.isFinite);
  return {
    offerCount: offers.length,
    sourceCount: runs.length,
    failedSourceCount: runs.filter((run) =>
      ["timeout", "blocked", "failed"].includes(run.status),
    ).length,
    minPrice: prices.length > 0 ? Math.min(...prices).toFixed(2) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices).toFixed(2) : null,
  };
}

export async function runPersistedSearch({
  identity,
  conversationId,
  input,
}: {
  identity: RequestIdentity;
  conversationId: string;
  input: SearchRequest;
}): Promise<SearchJobResult> {
  const request = SearchRequestSchema.parse(input);
  const conversation = await loadConversation(conversationId, identity);
  if (!conversation) throw new Error("conversation_not_found");

  const key = idempotencyKey(conversationId, request);
  const admin = createSupabaseAdminClient();
  if (admin) {
    let duplicateQuery = admin
      .from("search_jobs")
      .select("id")
      .eq("idempotency_key", key)
      .limit(1);
    duplicateQuery =
      identity.kind === "user"
        ? duplicateQuery.eq("user_id", identity.userId)
        : duplicateQuery.eq("session_id_hash", identity.sessionIdHash);
    const { data: duplicate, error } = await duplicateQuery.maybeSingle();
    if (error) throw error;
    if (duplicate) {
      const existing = await getPersistedSearchResult({
        identity,
        conversationId,
        searchJobId: duplicate.id,
      });
      if (existing) return existing;
    }
  } else {
    const duplicate = [...memorySearches.values()].find(
      (stored) =>
        stored.owner === ownerKey(identity) &&
        stored.conversationId === conversationId &&
        stored.idempotencyKey === key,
    );
    if (duplicate) return SearchJobResultSchema.parse(duplicate);
  }

  await assertGuestQuota(identity, "search_started");
  const jobId = crypto.randomUUID();
  const searchRequestId = crypto.randomUUID();
  const adapters = enabledAdapters();

  if (admin) {
    const { error: requestError } = await admin.from("search_requests").insert({
      id: searchRequestId,
      conversation_id: conversationId,
      query_text: request.query,
      request_payload: request,
      ...ownerColumns(identity),
    });
    if (requestError) throw requestError;
    const { error: jobError } = await admin.from("search_jobs").insert({
      id: jobId,
      conversation_id: conversationId,
      search_request_id: searchRequestId,
      idempotency_key: key,
      status: "running",
      query_text: request.query,
      request_payload: request,
      ...ownerColumns(identity),
    });
    if (jobError) throw jobError;
    if (adapters.length > 0) {
      const { error: sourcesError } = await admin
        .from("search_job_sources")
        .insert(
          adapters.map(({ sourceId }) => ({
            search_job_id: jobId,
            source_id: sourceId,
            status: "running",
            started_at: new Date().toISOString(),
          })),
        );
      if (sourcesError) throw sourcesError;
    }
  }

  await recordUsageEvent({
    identity,
    eventType: "search_started",
    conversationId,
    searchJobId: jobId,
  });

  const runs = await Promise.all(
    adapters.map(({ sourceId, adapter }) =>
      runAdapter(sourceId, adapter, request),
    ),
  );
  const clarification =
    runs.find((run) => run.clarification)?.clarification ?? null;
  const offers = clarification
    ? []
    : deduplicateOffers(runs.flatMap((run) => run.offers));
  const failedCount = runs.filter((run) =>
    ["timeout", "blocked", "failed"].includes(run.status),
  ).length;
  const status =
    runs.length === 0 || (offers.length === 0 && failedCount === runs.length)
      ? "failed"
      : failedCount > 0
        ? "partial"
        : "completed";
  const result = SearchJobResultSchema.parse({
    jobId,
    status,
    offers,
    clarification,
    sources: runs.map((run) => ({
      sourceId: run.sourceId,
      status: run.status,
      offerCount: run.offers.length,
      durationMs: run.durationMs,
      errorMessage: run.errorMessage,
    })),
  });

  if (admin) {
    await Promise.all(
      runs.map((run) =>
        admin
          .from("search_job_sources")
          .update({
            status: run.status,
            offer_count: run.offers.length,
            duration_ms: run.durationMs,
            error_code: run.errorCode,
            error_message: run.errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("search_job_id", jobId)
          .eq("source_id", run.sourceId)
          .then(({ error }) => {
            if (error) throw error;
          }),
      ),
    );
    if (offers.length > 0) {
      const { error } = await admin.from("offers").upsert(
        offers.map((offer) => ({
          search_job_id: jobId,
          source_id: offer.sourceId,
          external_id: offer.externalId,
          external_url: offer.externalUrl,
          normalized_part_number: offer.normalizedPartNumber ?? null,
          seller_name: offer.sellerName ?? null,
          price_amount: offer.priceAmount ?? null,
          currency: offer.currency,
          payload: offer,
          fetched_at: offer.fetchedAt,
        })),
        { onConflict: "search_job_id,source_id,external_id" },
      );
      if (error) throw error;
    }
    const { error: jobError } = await admin
      .from("search_jobs")
      .update({
        status,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (jobError) throw jobError;
  } else {
    memorySearches.set(jobId, {
      ...result,
      owner: ownerKey(identity),
      conversationId,
      idempotencyKey: key,
    });
  }

  await saveConversationState({
    identity,
    conversationId,
    state: {
      ...conversation.state,
      searchDraft: request,
      latestSearchJobId: jobId,
      latestSearchSummary: summarize(offers, runs),
    },
  });
  return result;
}

export async function getPersistedSearchResult({
  identity,
  conversationId,
  searchJobId,
}: {
  identity: RequestIdentity;
  conversationId: string;
  searchJobId: string;
}): Promise<SearchJobResult | null> {
  const conversation = await loadConversation(conversationId, identity);
  if (!conversation) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const stored = memorySearches.get(searchJobId);
    if (
      !stored ||
      stored.owner !== ownerKey(identity) ||
      stored.conversationId !== conversationId
    ) {
      return null;
    }
    return SearchJobResultSchema.parse(stored);
  }

  let jobQuery = admin
    .from("search_jobs")
    .select("id,status")
    .eq("id", searchJobId)
    .eq("conversation_id", conversationId);
  jobQuery =
    identity.kind === "user"
      ? jobQuery.eq("user_id", identity.userId)
      : jobQuery.eq("session_id_hash", identity.sessionIdHash);
  const { data: job, error: jobError } = await jobQuery.maybeSingle();
  if (jobError) throw jobError;
  if (!job) return null;
  const [{ data: offerRows, error: offerError }, sourceResult] =
    await Promise.all([
      admin.from("offers").select("payload").eq("search_job_id", searchJobId),
      admin
        .from("search_job_sources")
        .select("source_id,status,offer_count,duration_ms,error_message")
        .eq("search_job_id", searchJobId),
    ]);
  if (offerError) throw offerError;
  if (sourceResult.error) throw sourceResult.error;
  return SearchJobResultSchema.parse({
    jobId: job.id,
    status: job.status,
    clarification: null,
    offers: (offerRows ?? []).map((row) => row.payload),
    sources: (sourceResult.data ?? []).map((row) => ({
      sourceId: row.source_id,
      status: row.status,
      offerCount: row.offer_count,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
    })),
  });
}
