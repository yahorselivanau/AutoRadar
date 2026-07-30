import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  validateUIMessages,
} from "ai";
import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { recordUsageEvent } from "@/lib/auth/quota";
import { createPartsAgent, PARTS_AGENT_MODEL } from "@/lib/ai/parts-agent";
import type { PartsAgentUIMessage } from "@/lib/ai/parts-agent";
import { PARTS_AGENT_PROMPT_VERSION } from "@/lib/ai/prompts/parts-agent.v1";
import {
  createConversation,
  createConversationDraft,
  loadConversation,
  saveConversationMessages,
  saveConversationState,
} from "@/lib/chat/store";
import { classifySearchIntent } from "@/lib/search/intent-router";
import { readMvpFeatureFlags } from "@/lib/mvp-feature-flags";
import { applyIntentTransition } from "@/lib/ai/conversation-transitions";

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
  vehicleConfirmationPending: z.boolean().optional(),
});

const IncomingUserMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.literal("user"),
    parts: z
      .array(
        z
          .object({
            type: z.string(),
            text: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()
  .refine(
    (message) =>
      message.parts.some(
        (part) => part.type === "text" && Boolean(part.text?.trim()),
      ),
    "empty_message",
  );

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

export async function POST(request: Request) {
  const payload = InputSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json(
      { error: "Не удалось прочитать сообщение." },
      { status: 400 },
    );
  }

  const identity = await resolveRequestIdentity();
  const incoming = IncomingUserMessageSchema.safeParse(payload.data.message);
  if (!incoming.success) {
    return Response.json({ error: "Введите сообщение." }, { status: 400 });
  }
  const storedConversation = await loadConversation(payload.data.id, identity);
  let conversation =
    storedConversation ??
    (await createConversationDraft(identity, payload.data.id));

  let state = conversation.state;
  if (payload.data.activeVehicle) {
    state = { ...state, activeVehicle: payload.data.activeVehicle };
  }
  if (payload.data.vehicleConfirmationPending) {
    state = {
      ...state,
      readiness: "needs_vehicle_confirmation",
    };
  }
  const latestUserText = incoming.data.parts
    .filter(
      (part): part is typeof part & { text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join(" ");
  const flags = readMvpFeatureFlags();
  const intent = flags.deterministicIntent
    ? classifySearchIntent(latestUserText)
    : null;
  state = applyIntentTransition(state, intent, {
    vehicleConfirmationPending: Boolean(
      payload.data.vehicleConfirmationPending,
    ),
    symptomDialogueEnabled: flags.symptomDialogue,
  });

  const agent = createPartsAgent({
    identity,
    conversationId: conversation.id,
    initialState: state,
    latestUserText,
  });

  let validated: PartsAgentUIMessage[];
  try {
    const hasIncoming = conversation.messages.some(
      (message) => message.id === incoming.data.id,
    );
    validated = (await validateUIMessages({
      messages: redactVin([
        ...conversation.messages,
        ...(hasIncoming ? [] : [incoming.data]),
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

  if (!storedConversation) {
    conversation = await createConversation(identity, payload.data.id);
  }
  if (
    payload.data.activeVehicle ||
    intent?.mode === "part_number" ||
    (intent?.mode === "symptom" && flags.symptomDialogue)
  ) {
    await saveConversationState({
      identity,
      conversationId: conversation.id,
      state,
    });
  }
  await saveConversationMessages({
    identity,
    conversationId: conversation.id,
    messages: validated,
    model: PARTS_AGENT_MODEL,
    promptVersion: PARTS_AGENT_PROMPT_VERSION,
  });
  await recordUsageEvent({
    identity,
    eventType: "assistant_turn",
    conversationId: conversation.id,
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
    },
    onError: () =>
      "Не удалось получить ответ. Запрос и история сохранены — попробуйте ещё раз.",
  });
}
