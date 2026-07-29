import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = z
    .object({ id: z.string().uuid() })
    .safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "Автомобиль не найден." }, { status: 404 });
  }
  const identity = await resolveRequestIdentity();
  if (identity.kind !== "user") {
    return Response.json({ code: "guest" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return Response.json({ error: "Supabase не настроен." }, { status: 503 });
  }
  const { error } = await admin
    .from("vehicles")
    .delete()
    .eq("id", params.data.id)
    .eq("user_id", identity.userId);
  if (error) throw error;
  return new Response(null, { status: 204 });
}
