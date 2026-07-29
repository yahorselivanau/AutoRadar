import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  validateUIMessages,
} from "ai";
import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { assertGuestQuota, recordUsageEvent } from "@/lib/auth/quota";
import { createPartsAgent, PARTS_AGENT_MODEL } from "@/lib/ai/parts-agent";
import type { PartsAgentUIMessage } from "@/lib/ai/parts-agent";
import { PARTS_AGENT_PROMPT_VERSION } from "@/lib/ai/prompts/parts-agent.v1";
import {
  loadConversation,
  saveConversationMessages,
  saveConversationState,
} from "@/lib/chat/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const InputSchema = z.object({
  id: z.string().uuid(),
  message: z.unknown(),
  activeVehicle: z
    .object({
      make: z.string().min(1),
      model: z.string().min(1),
      year: z.number().int().min(1886).max(2200),
      generation: z.string().optional(),
      body: z.string().optional(),
      engine: z.string().optional(),
      transmission: z.string().optional(),
      doors: z.number().int().min(2).max(6).optional(),
    })
    .nullable()
    .optional(),
});

const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

function redactVin(messages: PartsAgentUIMessage[]): PartsAgentUIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text"
        ? { ...part, text: part.text.replace(vinPattern, "[VIN скрыт]") }
        : part,
    ),
  }));
}

function guestLimitResponse(code: string, error: string) {
  return Response.json({ code, error }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = InputSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json(
      { error: "Не удалось прочитать сообщение." },
      { status: 400 },
    );
  }

  const identity = await resolveRequestIdentity();
  const conversation = await loadConversation(payload.data.id, identity);
  if (!conversation) {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }

  try {
    await assertGuestQuota(identity, "assistant_turn");
  } catch {
    return guestLimitResponse(
      "guest_dialogue_limit",
      "Лимит ответов на сегодня исчерпан. Войдите, чтобы продолжить этот диалог без ограничений.",
    );
  }

  let state = conversation.state;
  if (payload.data.activeVehicle) {
    state = { ...state, activeVehicle: payload.data.activeVehicle };
    await saveConversationState({
      identity,
      conversationId: conversation.id,
      state,
    });
  }

  const agent = createPartsAgent({
    identity,
    conversationId: conversation.id,
    initialState: state,
  });

  let validated: PartsAgentUIMessage[];
  try {
    const incoming = payload.data.message as PartsAgentUIMessage;
    const hasIncoming = conversation.messages.some(
      (message) => message.id === incoming?.id,
    );
    validated = (await validateUIMessages({
      messages: redactVin([
        ...conversation.messages,
        ...(hasIncoming ? [] : [incoming]),
      ] as PartsAgentUIMessage[]) as unknown[],
      tools: agent.tools,
    })) as PartsAgentUIMessage[];
  } catch {
    return Response.json(
      {
        error:
          "История диалога повреждена или устарела. Создайте новый диалог.",
      },
      { status: 409 },
    );
  }

  await saveConversationMessages({
    identity,
    conversationId: conversation.id,
    messages: validated,
    model: PARTS_AGENT_MODEL,
    promptVersion: PARTS_AGENT_PROMPT_VERSION,
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: validated,
    originalMessages: validated,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 18 }),
    consumeSseStream: consumeStream,
    onFinish: async ({ messages }) => {
      await saveConversationMessages({
        identity,
        conversationId: conversation.id,
        messages,
        model: PARTS_AGENT_MODEL,
        promptVersion: PARTS_AGENT_PROMPT_VERSION,
      });
      await recordUsageEvent({
        identity,
        eventType: "assistant_turn",
        conversationId: conversation.id,
      });
    },
    onError: () =>
      "Не удалось получить ответ. Запрос и история сохранены — попробуйте ещё раз.",
  });
}
