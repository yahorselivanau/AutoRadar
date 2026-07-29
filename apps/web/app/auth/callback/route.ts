import { NextResponse } from "next/server";

import { readGuestSessionHash } from "@/lib/auth/identity";
import { claimGuestData } from "@/lib/chat/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext =
    next?.startsWith("/") && !next.startsWith("//") ? next : "/chat";
  const guestSessionHash = await readGuestSessionHash();
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=callback_failed", url.origin),
    );
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=callback_failed", url.origin),
    );
  }
  if (guestSessionHash) {
    await claimGuestData(guestSessionHash, data.user.id);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
