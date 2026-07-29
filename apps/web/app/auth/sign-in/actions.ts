"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const EmailSchema = z.string().trim().email().max(320);

export async function sendMagicLink(formData: FormData) {
  const email = EmailSchema.safeParse(formData.get("email"));
  if (!email.success) {
    redirect("/auth/sign-in?error=invalid_email");
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/auth/sign-in?error=auth_not_configured");
  }
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/chat`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    redirect("/auth/sign-in?error=send_failed");
  }
  redirect("/auth/sign-in?sent=1");
}
