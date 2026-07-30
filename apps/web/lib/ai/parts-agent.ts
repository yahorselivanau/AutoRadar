import "server-only";

import {
  ConversationStateSchema,
  SearchRequestSchema,
  VehicleContextSchema,
  type ConversationState,
  type SearchRequest,
} from "@autoradar/domain";
import { InferAgentUIMessage, stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import type { RequestIdentity } from "@/lib/auth/identity";
import {
  PARTS_AGENT_PROMPT_VERSION,
  PARTS_AGENT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/parts-agent.v1";
import { loadConversation, saveConversationState } from "@/lib/chat/store";
import {
  getPersistedSearchResult,
  runPersistedSearch,
} from "@/lib/search/run-persisted-search";

export const PARTS_AGENT_MODEL = "openai/gpt-5.4-nano";

function configuredModel() {
  const model = process.env.AI_MODEL ?? PARTS_AGENT_MODEL;
  if (model !== PARTS_AGENT_MODEL) {
    throw new Error(
      `AI_MODEL должен оставаться ${PARTS_AGENT_MODEL} для текущего релиза.`,
    );
  }
  return model;
}

const ClarificationInputSchema = z.object({
  question: z.string().trim().min(1).max(240),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
});

export function createPartsAgent({
  identity,
  conversationId,
  initialState,
  latestUserText,
}: {
  identity: RequestIdentity;
  conversationId: string;
  initialState: ConversationState;
  latestUserText: string;
}) {
  let state = ConversationStateSchema.parse(initialState);

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
      execute: async (vehicle) => {
        await persistState({ ...state, activeVehicle: vehicle });
        return { saved: true, vehicle };
      },
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
        const parsed = SearchRequestSchema.parse(merged);
        await persistState({ ...state, searchDraft: parsed });
        return { kind: "search_draft" as const, request: parsed };
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
      execute: async (request) => {
        try {
          const merged = SearchRequestSchema.parse(
            removeInventedDoorCount({
              ...request,
              vehicle: request.vehicle ?? state.activeVehicle ?? undefined,
            }),
          );
          await persistState({ ...state, searchDraft: merged });
          const result = await runPersistedSearch({
            identity,
            conversationId,
            input: merged,
          });
          const refreshed = await loadConversation(conversationId, identity);
          if (refreshed) state = refreshed.state;
          return { kind: "search_result" as const, ...result };
        } catch (error) {
          if (error instanceof Error && error.name === "GuestQuotaError") {
            return {
              kind: "guest_quota_exceeded" as const,
              message:
                "Лимит новых поисков для гостя исчерпан. Текущие результаты и история доступны после закрытия окна входа.",
            };
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
    model: configuredModel(),
    instructions: `${PARTS_AGENT_SYSTEM_PROMPT}

Текущее серверное состояние:
${JSON.stringify(state)}`,
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
    providerOptions: {
      gateway: {
        disallowPromptTraining: true,
        user: identity.trackingId,
        tags: [
          "app:autoradar",
          "feature:parts-agent",
          `prompt:${PARTS_AGENT_PROMPT_VERSION}`,
          "model:gpt-5.4-nano",
        ],
      },
    },
  });
}

export type PartsAgent = ReturnType<typeof createPartsAgent>;
export type PartsAgentUIMessage = InferAgentUIMessage<PartsAgent>;
