import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import {
  createConversationDraft,
  listConversations,
} from "@/lib/chat/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const identity = await resolveRequestIdentity();
    return Response.json({
      conversations: await listConversations(identity),
    });
  } catch {
    return configurationErrorResponse();
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = z.object({}).passthrough().safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  try {
    const identity = await resolveRequestIdentity();
    const conversation = await createConversationDraft(identity);
    return Response.json(conversation, { status: 201 });
  } catch {
    return configurationErrorResponse();
  }
}

function configurationErrorResponse() {
  return Response.json(
    {
      code: "server_not_configured",
      error:
        "Сервис временно не настроен. Администратору нужно проверить переменные окружения.",
    },
    { status: 503 },
  );
}
