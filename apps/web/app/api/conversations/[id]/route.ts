import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { loadConversation } from "@/lib/chat/store";

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
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }
  return Response.json(conversation);
}
