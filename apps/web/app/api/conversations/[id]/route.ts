import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import {
  createConversationDraft,
  deleteConversation,
  loadConversation,
  renameConversation,
} from "@/lib/chat/store";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }
  const identity = await resolveRequestIdentity();
  const conversation = await loadConversation(params.data.id, identity);
  if (!conversation) {
    return Response.json(
      await createConversationDraft(identity, params.data.id),
    );
  }
  return Response.json(conversation);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = ParamsSchema.safeParse(await context.params);
  const payload = z
    .object({ title: z.string().trim().min(1).max(72) })
    .safeParse(await request.json().catch(() => null));
  if (!params.success || !payload.success) {
    return Response.json({ error: "Некорректное название." }, { status: 400 });
  }
  const identity = await resolveRequestIdentity();
  try {
    return Response.json(
      await renameConversation({
        identity,
        conversationId: params.data.id,
        title: payload.data.title,
      }),
    );
  } catch {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }
  const identity = await resolveRequestIdentity();
  try {
    await deleteConversation({
      identity,
      conversationId: params.data.id,
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }
}
