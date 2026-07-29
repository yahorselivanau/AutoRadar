"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { readGuestSessionHash } from "@/lib/auth/identity";
import { claimGuestData } from "@/lib/chat/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EmailSchema = z.string().trim().email().max(320);
const PasswordSchema = z.string().min(8).max(72);

function authRedirect(mode: "sign-in" | "sign-up", error: string): never {
  redirect(`/auth/sign-in?mode=${mode}&error=${error}`);
}

async function finishAuthentication(userId: string) {
  const guestSessionHash = await readGuestSessionHash();
  if (guestSessionHash) {
    await claimGuestData(guestSessionHash, userId);
  }
  redirect("/chat");
}

export async function signInWithPassword(formData: FormData) {
  const parsed = z
    .object({
      email: EmailSchema,
      password: PasswordSchema,
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) authRedirect("sign-in", "invalid_credentials");

  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect("sign-in", "auth_not_configured");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) authRedirect("sign-in", "invalid_credentials");
  await finishAuthentication(data.user.id);
}

export async function signUpWithPassword(formData: FormData) {
  const parsed = z
    .object({
      email: EmailSchema,
      password: PasswordSchema,
      passwordConfirmation: PasswordSchema,
    })
    .refine((value) => value.password === value.passwordConfirmation, {
      path: ["passwordConfirmation"],
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      passwordConfirmation: formData.get("passwordConfirmation"),
    });
  if (!parsed.success) authRedirect("sign-up", "invalid_registration");

  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect("sign-up", "auth_not_configured");

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) authRedirect("sign-up", "registration_failed");
  if (!data.session) {
    authRedirect("sign-up", "email_confirmation_enabled");
  }
  await finishAuthentication(data.user.id);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/chat");
}
