import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { createConversation, listConversations } from "@/lib/chat/store";

export const runtime = "nodejs";

export async function GET() {
  const identity = await resolveRequestIdentity();
  return Response.json({
    conversations: await listConversations(identity),
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = z.object({}).passthrough().safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const identity = await resolveRequestIdentity();
  try {
    const conversation = await createConversation(identity);
    return Response.json(conversation, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "GuestQuotaError") {
      return Response.json(
        {
          code: "guest_conversation_limit",
          error:
            "Бесплатные новые диалоги на сегодня закончились. Войдите, чтобы продолжить и сохранить историю.",
        },
        { status: 403 },
      );
    }
    throw error;
  }
}
