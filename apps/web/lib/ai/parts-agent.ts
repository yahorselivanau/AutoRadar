import "server-only";

import {
  ConversationStateSchema,
  SearchRequestSchema,
  SymptomAssessmentSchema,
  SymptomHypothesisSchema,
  VehicleContextSchema,
  type ConversationState,
  type SearchRequest,
  type SourceId,
} from "@autoradar/domain";
import { InferAgentUIMessage, stepCountIs, tool, ToolLoopAgent } from "ai";
import { normalizeSearchRequest } from "@autoradar/search-actor/request-normalizer";
import { z } from "zod";

import type { RequestIdentity } from "@/lib/auth/identity";
import { PARTS_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts/parts-agent.v1";
import { loadConversation, saveConversationState } from "@/lib/chat/store";
import { assessSymptomSafety } from "@/lib/ai/symptom-safety";
import { confirmVehicleTransition } from "@/lib/ai/conversation-transitions";
import {
  getPersistedSearchResult,
  streamPersistedSearch,
} from "@/lib/search/run-persisted-search";
import { resolveZapEngineSelection } from "@/lib/search/zap-engine-selection";
import { GEMINI_MODEL, getGeminiModel } from "@/lib/ai/gemini";

export const PARTS_AGENT_MODEL = GEMINI_MODEL;

const ClarificationInputSchema = z.object({
  question: z.string().trim().min(1).max(240),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
});

const SymptomAssessmentInputSchema = z.object({
  observations: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
  nextQuestion: z.string().trim().min(1).max(240).nullable(),
  hypotheses: z.array(SymptomHypothesisSchema).min(1).max(3),
});

export function createPartsAgent({
  identity,
  conversationId,
  initialState,
  latestUserText,
  activeVehicleVin,
}: {
  identity: RequestIdentity;
  conversationId: string;
  initialState: ConversationState;
  latestUserText: string;
  activeVehicleVin?: string;
}) {
  let state = ConversationStateSchema.parse(initialState);
  let retrySourceIds: SourceId[] | undefined;

  const removeInventedDoorCount = <T extends SearchRequest>(request: T): T => {
    if (!request.vehicle?.doors) return request;
    const previousDoors =
      state.searchDraft?.vehicle?.doors ?? state.activeVehicle?.doors;
    const explicitDoors = latestUserText.match(
      /\b([2-6])\s*(?:-?\s*)?(?:двер(?:и|ей|ь)?|door(?:s)?)\b/i,
    )?.[1];
    if (
      previousDoors === request.vehicle.doors ||
      Number(explicitDoors) === request.vehicle.doors
    ) {
      return request;
    }
    return {
      ...request,
      vehicle: { ...request.vehicle, doors: undefined },
    } as T;
  };

  const persistState = async (nextState: ConversationState) => {
    state = ConversationStateSchema.parse(nextState);
    await saveConversationState({ identity, conversationId, state });
  };

  const confirmVehicle = async (
    vehicle: z.infer<typeof VehicleContextSchema>,
  ) => {
    await persistState(confirmVehicleTransition(state, vehicle));
    return { saved: true, vehicle };
  };

  const prepareZapEngineSelection = async (request: SearchRequest) => {
    const resolved = await resolveZapEngineSelection(request);
    const enrichedRequest = resolved.request;
    if (resolved.result.kind === "vehicle_variants") {
      const options = resolved.result.variants.slice(0, 8).map((variant) => ({
        id: variant.id,
        label: [
          variant.label,
          variant.yearFrom && variant.yearTo
            ? `${variant.yearFrom}–${variant.yearTo}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        value: variant.label,
      }));
      return {
        kind: "vehicle_variants" as const,
        request: enrichedRequest,
        clarification: {
          id: "zap-generation-selection",
          field: "generation" as const,
          question:
            "Сначала выберите поколение или кузов автомобиля для Zap.by.",
          options,
        },
      };
    }

    const engines = resolved.result.engines.slice(0, 8);
    if (engines.length === 0) {
      return {
        kind: "unavailable" as const,
        request: enrichedRequest,
        message: "Zap.by не вернул типы двигателя для выбранной модели и года.",
      };
    }
    if (engines.length === 1) {
      const engine = engines[0]!;
      const nextRequest = normalizeSearchRequest(
        SearchRequestSchema.parse({
          ...enrichedRequest,
          vehicle: {
            ...enrichedRequest.vehicle,
            engine: [engine.label, engine.details].filter(Boolean).join(" · "),
          },
        }),
      );
      return {
        kind: "auto_selected" as const,
        request: nextRequest,
        engine: nextRequest.vehicle?.engine ?? engine.label,
      };
    }

    return {
      kind: "engines" as const,
      request: enrichedRequest,
      clarification: {
        id: "zap-engine-selection",
        field: "engine" as const,
        question:
          "Выберите тип двигателя — без него Zap.by не сможет выполнить поиск.",
        options: engines.map((engine) => ({
          id: engine.id,
          label: [engine.label, engine.details].filter(Boolean).join(" · "),
          value: [engine.label, engine.details].filter(Boolean).join(" · "),
        })),
      },
    };
  };

  const tools = {
    get_context: tool({
      description:
        "Вернуть активную машину, текущий запрос и сводку последнего поиска. Используй для вопросов о текущем контексте.",
      inputSchema: z.object({}),
      execute: async () => {
        const conversation = await loadConversation(conversationId, identity);
        const latest =
          conversation?.state.latestSearchJobId == null
            ? null
            : await getPersistedSearchResult({
                identity,
                conversationId,
                searchJobId: conversation.state.latestSearchJobId,
              });
        return {
          state: conversation?.state ?? state,
          latestSearch: latest
            ? {
                jobId: latest.jobId,
                status: latest.status,
                offers: latest.offers.slice(0, 20),
                sources: latest.sources,
              }
            : null,
        };
      },
    }),
    set_active_vehicle: tool({
      description:
        "Сохранить подтверждённые пользователем параметры активной машины в контексте диалога. Не выдумывай отсутствующие поля.",
      inputSchema: VehicleContextSchema,
      execute: confirmVehicle,
    }),
    confirm_vehicle: tool({
      description:
        "Подтвердить отредактированную пользователем машину. Вызывай только после явного подтверждения, никогда по одному результату VIN resolver.",
      inputSchema: VehicleContextSchema,
      execute: confirmVehicle,
    }),
    update_search_draft: tool({
      description:
        "Сохранить или изменить структурированный запрос детали без запуска поиска. Вызывай для новой детали или изменения параметров.",
      inputSchema: SearchRequestSchema,
      execute: async (request) => {
        const merged = removeInventedDoorCount({
          ...request,
          vehicle: request.vehicle ?? state.activeVehicle ?? undefined,
        });
        const parsed = normalizeSearchRequest(
          SearchRequestSchema.parse(merged),
        );
        await persistState({
          ...state,
          searchDraft: parsed,
          readiness: parsed.part.name ? "ready" : "collecting",
          pendingClarification: null,
        });
        return { kind: "search_draft" as const, request: parsed };
      },
    }),
    prepare_zap_engine_selection: tool({
      description:
        "Перед поиском по автомобилю получить из Zap.by доступные типы двигателя. Не запускает поиск и не расходует лимит. Используй, когда у запроса есть марка, модель и год, но нет двигателя.",
      inputSchema: SearchRequestSchema,
      execute: async (request) => {
        const merged = normalizeSearchRequest(
          SearchRequestSchema.parse({
            ...request,
            vehicle: request.vehicle ?? state.activeVehicle ?? undefined,
          }),
        );
        if (
          process.env.SOURCE_ZAP_ENABLED === "false" ||
          !merged.vehicle ||
          merged.vehicle.engine
        ) {
          return { kind: "not_required" as const, request: merged };
        }
        try {
          const result = await prepareZapEngineSelection(merged);
          if (result.kind === "engines" || result.kind === "vehicle_variants") {
            await persistState({
              ...state,
              searchDraft: result.request,
              pendingClarification: {
                ...result.clarification,
                sourceId: "zap",
                originalSearchRequest: result.request,
              },
              readiness: "collecting",
            });
            return {
              kind: "selection_required" as const,
              request: result.request,
              clarification: result.clarification,
            };
          }
          if (result.kind === "auto_selected") {
            const confirmedVehicle = result.request.vehicle
              ? VehicleContextSchema.safeParse(result.request.vehicle)
              : null;
            await persistState({
              ...state,
              searchDraft: result.request,
              activeVehicle: confirmedVehicle?.success
                ? confirmedVehicle.data
                : state.activeVehicle,
              readiness: "ready",
              pendingClarification: null,
            });
            return {
              kind: "engine_auto_selected" as const,
              request: result.request,
            };
          }
          return result;
        } catch (error) {
          return {
            kind: "unavailable" as const,
            request: merged,
            message:
              error instanceof Error
                ? error.message
                : "Не удалось получить двигатели из Zap.by.",
          };
        }
      },
    }),
    assess_symptom: tool({
      description:
        "Сохранить наблюдения, один следующий вопрос и 1–3 возможных узла. Это не диагноз: не указывай OEM и не утверждай причину наверняка.",
      inputSchema: SymptomAssessmentInputSchema,
      execute: async (assessment) => {
        const previousCount = state.symptomAssessment?.clarificationCount ?? 0;
        const clarificationCount = Math.min(previousCount + 1, 5);
        const safety = assessSymptomSafety(
          `${latestUserText} ${assessment.observations.join(" ")}`,
        );
        const parsed = SymptomAssessmentSchema.parse({
          ...assessment,
          nextQuestion:
            clarificationCount >= 5 ? null : assessment.nextQuestion,
          selectedHypothesisId: null,
          safetySeverity: safety.severity,
          safetyMessage: safety.message,
          clarificationCount,
        });
        await persistState({
          ...state,
          symptomAssessment: parsed,
          readiness: "needs_part_confirmation",
        });
        return { kind: "symptom_assessment" as const, assessment: parsed };
      },
    }),
    select_part_hypothesis: tool({
      description:
        "Выбрать один из ранее показанных возможных узлов только после выбора пользователя и создать детерминированный черновик детали.",
      inputSchema: z.object({ hypothesisId: z.string().min(1) }),
      execute: async ({ hypothesisId }) => {
        const hypothesis = state.symptomAssessment?.hypotheses.find(
          (item) => item.id === hypothesisId,
        );
        if (!hypothesis) {
          return { kind: "unknown_hypothesis" as const };
        }
        const draft = normalizeSearchRequest(
          SearchRequestSchema.parse({
            query: `${hypothesis.partName}${state.activeVehicle ? ` ${state.activeVehicle.make} ${state.activeVehicle.model}` : ""}`,
            vehicle: state.activeVehicle ?? undefined,
            part: { name: hypothesis.partName, condition: "any" },
          }),
        );
        await persistState({
          ...state,
          symptomAssessment: {
            ...state.symptomAssessment!,
            selectedHypothesisId: hypothesisId,
          },
          searchDraft: draft,
          readiness: state.activeVehicle ? "ready" : "collecting",
        });
        return { kind: "search_draft" as const, request: draft };
      },
    }),
    apply_source_clarification: tool({
      description:
        "Применить выбранный пользователем вариант активного уточнения источника к тому же черновику. Не создавай новый поиск из другого контекста.",
      inputSchema: z.object({
        clarificationId: z.string().min(1),
        optionId: z.string().min(1),
      }),
      execute: async ({ clarificationId, optionId }) => {
        const pending = state.pendingClarification;
        if (!pending || pending.id !== clarificationId) {
          return { kind: "clarification_expired" as const };
        }
        const option = pending.options.find((item) => item.id === optionId);
        if (!option) return { kind: "clarification_option_unknown" as const };
        const request = state.searchDraft;
        if (!request) return { kind: "no_search_draft" as const };
        const value = String(option.value);
        const nextVehicle =
          pending.field === "generation" ||
          pending.field === "body" ||
          pending.field === "engine"
            ? { ...request.vehicle, [pending.field]: value }
            : pending.field === "doors"
              ? { ...request.vehicle, doors: Number(option.value) }
              : request.vehicle;
        const updated = normalizeSearchRequest(
          SearchRequestSchema.parse({
            ...request,
            vehicle: nextVehicle,
            part:
              pending.field === "part_attribute" && pending.attributeKey
                ? {
                    ...request.part,
                    constraints: [
                      ...request.part.constraints.filter(
                        (constraint) => constraint.key !== pending.attributeKey,
                      ),
                      { key: pending.attributeKey, value },
                    ],
                  }
                : request.part,
          }),
        );
        const isZapEngineSelection = pending.id === "zap-engine-selection";
        retrySourceIds = isZapEngineSelection
          ? undefined
          : pending.sourceId
            ? [pending.sourceId]
            : undefined;
        const confirmedVehicle = VehicleContextSchema.safeParse(
          updated.vehicle,
        );
        await persistState({
          ...state,
          activeVehicle: confirmedVehicle.success
            ? confirmedVehicle.data
            : state.activeVehicle,
          searchDraft: updated,
          pendingClarification: null,
          readiness: "ready",
        });
        return {
          kind: isZapEngineSelection
            ? ("vehicle_updated" as const)
            : ("search_draft" as const),
          request: updated,
          vehicle: confirmedVehicle.success ? confirmedVehicle.data : undefined,
        };
      },
    }),
    ask_clarification: tool({
      description:
        "Показать один критичный вопрос и 2–5 коротких вариантов ответа. Не используй для необязательных деталей.",
      inputSchema: ClarificationInputSchema,
      execute: async (input) => ({
        kind: "clarification" as const,
        ...input,
      }),
    }),
    start_parts_search: tool({
      description:
        "Запустить реальный поиск по подключённым каталогам. Вызывай только после явного намерения пользователя искать.",
      inputSchema: SearchRequestSchema,
      execute: async function* (request) {
        try {
          if (
            state.symptomAssessment &&
            !state.symptomAssessment.selectedHypothesisId
          ) {
            yield {
              kind: "part_confirmation_required" as const,
              assessment: state.symptomAssessment,
            };
            return;
          }
          const merged = normalizeSearchRequest(
            SearchRequestSchema.parse(
              removeInventedDoorCount({
                ...request,
                vehicle: request.vehicle ?? state.activeVehicle ?? undefined,
              }),
            ),
          );
          let searchRequest = merged;
          if (
            process.env.SOURCE_ZAP_ENABLED !== "false" &&
            searchRequest.vehicle &&
            !searchRequest.vehicle.engine
          ) {
            const engineSelection =
              await prepareZapEngineSelection(searchRequest);
            if (
              engineSelection.kind === "engines" ||
              engineSelection.kind === "vehicle_variants"
            ) {
              await persistState({
                ...state,
                searchDraft: engineSelection.request,
                pendingClarification: {
                  ...engineSelection.clarification,
                  sourceId: "zap",
                  originalSearchRequest: engineSelection.request,
                },
                readiness: "collecting",
              });
              yield {
                kind: "engine_selection_required" as const,
                request: engineSelection.request,
                clarification: engineSelection.clarification,
              };
              return;
            }
            if (engineSelection.kind === "unavailable") {
              yield {
                kind: "engine_selection_unavailable" as const,
                message: engineSelection.message,
              };
              return;
            }
            searchRequest = engineSelection.request;
          }
          await persistState({
            ...state,
            searchDraft: searchRequest,
            readiness: "searching",
          });
          for await (const event of streamPersistedSearch({
            identity,
            conversationId,
            input: searchRequest,
            activeVehicleVin,
            sourceIds: retrySourceIds,
          })) {
            if (event.kind === "progress") {
              yield {
                kind: "search_progress" as const,
                event: event.progress,
              };
            } else {
              const refreshed = await loadConversation(
                conversationId,
                identity,
              );
              if (refreshed) state = refreshed.state;
              retrySourceIds = undefined;
              yield { kind: "search_result" as const, ...event.result };
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === "GuestQuotaError") {
            yield {
              kind: "guest_quota_exceeded" as const,
              message:
                "Лимит новых поисков для гостя исчерпан. Текущие результаты и история доступны после закрытия окна входа.",
            };
            return;
          }
          throw error;
        }
      },
    }),
    get_search_results: tool({
      description:
        "Получить сохранённые результаты текущего или указанного поиска для сравнения и ответа на follow-up вопрос.",
      inputSchema: z.object({
        searchJobId: z.string().uuid().optional(),
      }),
      execute: async ({ searchJobId }) => {
        const id = searchJobId ?? state.latestSearchJobId;
        if (!id) return { kind: "no_search_results" as const };
        const result = await getPersistedSearchResult({
          identity,
          conversationId,
          searchJobId: id,
        });
        return result
          ? { kind: "search_result" as const, ...result }
          : { kind: "no_search_results" as const };
      },
    }),
  };

  return new ToolLoopAgent({
    model: getGeminiModel(),
    instructions: `${PARTS_AGENT_SYSTEM_PROMPT}

Текущее серверное состояние:
${JSON.stringify(state)}`,
    tools,
    toolChoice: "auto",
    prepareStep: () => {
      const shared = [
        "get_context",
        "get_search_results",
        "ask_clarification",
      ] as const;
      if (state.readiness === "needs_vehicle_confirmation") {
        return {
          activeTools: [
            ...shared,
            "confirm_vehicle",
            "set_active_vehicle",
            "update_search_draft",
          ],
        };
      }
      if (
        state.readiness === "needs_part_confirmation" ||
        (state.symptomAssessment &&
          !state.symptomAssessment.selectedHypothesisId)
      ) {
        return {
          activeTools: [
            ...shared,
            "assess_symptom",
            "select_part_hypothesis",
            "update_search_draft",
          ],
        };
      }
      return {
        activeTools: [
          ...shared,
          "confirm_vehicle",
          "set_active_vehicle",
          "update_search_draft",
          "assess_symptom",
          "select_part_hypothesis",
          "apply_source_clarification",
          "start_parts_search",
        ],
      };
    },
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
  });
}

export type PartsAgent = ReturnType<typeof createPartsAgent>;
export type PartsAgentUIMessage = InferAgentUIMessage<PartsAgent>;
