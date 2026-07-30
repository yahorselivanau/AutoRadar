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
import { ArmtekPartsAdapter } from "@autoradar/search-actor/armtek";
import { Auto1PartsAdapter } from "@autoradar/search-actor/auto1";
import { MotorlandPartsAdapter } from "@autoradar/search-actor/motorland";
import { RemzonaPartsAdapter } from "@autoradar/search-actor/remzona";
import { planSourceSearch } from "@autoradar/search-actor/search-plan";
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
import { readMvpFeatureFlags } from "@/lib/mvp-feature-flags";
import { applyStructuredMatchEvidence } from "@/lib/search/match-evidence";

type AdapterRun = {
  sourceId: SourceId;
  status: SearchJobSourceStatus;
  durationMs: number;
  offers: NormalizedOffer[];
  clarification: SearchClarification | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PersistedSearchProgress =
  | {
      kind: "search_started";
      jobId: string;
      sourceIds: SourceId[];
    }
  | {
      kind: "source_completed";
      jobId: string;
      source: SearchJobResult["sources"][number];
      offers: NormalizedOffer[];
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
    ...(process.env.SOURCE_ARMTEK_ENABLED === "true"
      ? [
          {
            sourceId: "armtek" as const,
            adapter: new ArmtekPartsAdapter(),
          },
        ]
      : []),
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
    ...(process.env.SOURCE_AUTO1_ENABLED === "true"
      ? [{ sourceId: "auto1" as const, adapter: new Auto1PartsAdapter() }]
      : []),
    ...(process.env.SOURCE_REMZONA_ENABLED === "false"
      ? []
      : [
          {
            sourceId: "remzona" as const,
            adapter: new RemzonaPartsAdapter(),
          },
        ]),
  ];
}

function idempotencyKey(
  conversationId: string,
  input: SearchRequest,
  sourceIds?: readonly SourceId[],
): string {
  return createHash("sha256")
    .update(
      `${conversationId}:${JSON.stringify(input)}:${sourceIds?.slice().sort().join(",") ?? "all"}`,
    )
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
    const offers = result.offers.map((offer) =>
      applyStructuredMatchEvidence(offer, input),
    );
    return {
      sourceId,
      status: offers.length > 0 ? "completed" : "empty",
      durationMs: Date.now() - startedAt,
      offers,
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

async function runAdapterWithDeadline(
  sourceId: SourceId,
  adapter: PartsSourceAdapter,
  input: SearchRequest,
  timeoutMs = 25_000,
): Promise<AdapterRun> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runAdapter(sourceId, adapter, input),
      new Promise<AdapterRun>((resolve) => {
        timeout = setTimeout(
          () =>
            resolve({
              sourceId,
              status: "timeout",
              durationMs: timeoutMs,
              offers: [],
              clarification: null,
              errorCode: "timeout",
              errorMessage:
                "Источник не завершил поиск в общем лимите 25 секунд.",
            }),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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
  onProgress,
  sourceIds,
}: {
  identity: RequestIdentity;
  conversationId: string;
  input: SearchRequest;
  onProgress?: (progress: PersistedSearchProgress) => void | Promise<void>;
  sourceIds?: readonly SourceId[];
}): Promise<SearchJobResult> {
  const request = SearchRequestSchema.parse(input);
  const conversation = await loadConversation(conversationId, identity);
  if (!conversation) throw new Error("conversation_not_found");

  const key = idempotencyKey(conversationId, request, sourceIds);
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
  const adapters = enabledAdapters().filter(
    ({ sourceId }) => !sourceIds || sourceIds.includes(sourceId),
  );
  const searchPlan = readMvpFeatureFlags().sourceSearchPlanner
    ? planSourceSearch(
        request,
        adapters.map(({ adapter }) => adapter),
      )
    : {
        entries: adapters.map(({ sourceId }) => ({
          sourceId,
          strategy: "text" as const,
          query: request.query,
          skipReason: null,
        })),
      };

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

  await onProgress?.({
    kind: "search_started",
    jobId,
    sourceIds: adapters.map(({ sourceId }) => sourceId),
  });

  const runs = await Promise.all(
    adapters.map(async ({ sourceId, adapter }) => {
      const entry = searchPlan.entries.find(
        (planned) => planned.sourceId === sourceId,
      );
      const run =
        (sourceId === "armtek" &&
          !process.env.ARMTEK_GUEST_AUTH_TOKEN?.trim()) ||
        !entry ||
        entry.strategy === "skip"
          ? {
              sourceId,
              status: "disabled" as const,
              durationMs: 0,
              offers: [],
              clarification: null,
              errorCode: "unsupported-query",
              errorMessage:
                sourceId === "armtek" &&
                !process.env.ARMTEK_GUEST_AUTH_TOKEN?.trim()
                  ? "ARMTEK выключен: гостевой токен не настроен."
                  : (entry?.skipReason ?? "Нет подходящей стратегии поиска."),
            }
          : await runAdapterWithDeadline(sourceId, adapter, {
              ...request,
              query: entry.query ?? request.query,
            });
      if (admin) {
        if (run.offers.length > 0) {
          const { error: offerError } = await admin.from("offers").upsert(
            run.offers.map((offer) => ({
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
          if (offerError) throw offerError;
        }
        const { error: sourceError } = await admin
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
          .eq("source_id", run.sourceId);
        if (sourceError) throw sourceError;
      }
      await onProgress?.({
        kind: "source_completed",
        jobId,
        source: {
          sourceId: run.sourceId,
          status: run.status,
          offerCount: run.offers.length,
          durationMs: run.durationMs,
          errorMessage: run.errorMessage,
        },
        offers: run.offers,
      });
      return run;
    }),
  );
  const clarification =
    runs.find((run) => run.clarification)?.clarification ?? null;
  const offers = deduplicateOffers(runs.flatMap((run) => run.offers));
  const failedCount = runs.filter((run) =>
    ["timeout", "blocked", "failed"].includes(run.status),
  ).length;
  const runnableCount = runs.filter((run) => run.status !== "disabled").length;
  const status =
    runs.length === 0 ||
    runnableCount === 0 ||
    (offers.length === 0 && failedCount === runnableCount)
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
    const { error: jobError } = await admin
      .from("search_jobs")
      .update({
        status,
        clarification,
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
      readiness: clarification ? "collecting" : "ready",
      pendingClarification: clarification
        ? {
            ...clarification,
            sourceId: runs.find(
              (run) => run.clarification?.id === clarification.id,
            )?.sourceId,
            searchJobId: jobId,
            originalSearchRequest: request,
          }
        : null,
      latestSearchJobId: jobId,
      latestSearchSummary: summarize(offers, runs),
    },
  });
  return result;
}

export async function* streamPersistedSearch(
  input: Parameters<typeof runPersistedSearch>[0],
): AsyncGenerator<
  | { kind: "progress"; progress: PersistedSearchProgress }
  | { kind: "complete"; result: SearchJobResult }
> {
  const queue: PersistedSearchProgress[] = [];
  let wake: (() => void) | undefined;
  let result: SearchJobResult | undefined;
  let failure: unknown;
  let finished = false;

  void runPersistedSearch({
    ...input,
    onProgress: (progress) => {
      queue.push(progress);
      wake?.();
      wake = undefined;
    },
  }).then(
    (searchResult) => {
      result = searchResult;
      finished = true;
      wake?.();
    },
    (error: unknown) => {
      failure = error;
      finished = true;
      wake?.();
    },
  );

  while (!finished || queue.length > 0) {
    const progress = queue.shift();
    if (progress) {
      yield { kind: "progress", progress };
      continue;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  if (failure) throw failure;
  if (!result) throw new Error("search_finished_without_result");
  yield { kind: "complete", result };
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
    .select("id,status,clarification")
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
    clarification: job.clarification ?? null,
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
