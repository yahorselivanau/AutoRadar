import { ArrowRight, KeyRound, Mail, ShieldCheck, X } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, signInWithPassword, signUpWithPassword } from "./actions";

const errorMessages: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль.",
  invalid_registration:
    "Проверьте email, совпадение паролей и минимум 8 символов.",
  auth_not_configured: "Вход ещё не настроен для этого окружения.",
  registration_failed:
    "Не удалось создать аккаунт. Возможно, этот email уже зарегистрирован.",
  email_confirmation_enabled:
    "В Supabase всё ещё включено подтверждение email. Отключите Confirm email и повторите регистрацию.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const isSignUp = params.mode === "sign-up";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-topline">
          <Wordmark />
          <Link
            className="icon-button pressable"
            href="/chat"
            aria-label="Закрыть"
          >
            <X size={20} />
          </Link>
        </div>
        {user ? (
          <>
            <div>
              <span className="eyebrow">Ваш аккаунт</span>
              <h1>Вы вошли</h1>
              <p>{user.email}</p>
            </div>
            <Link className="button primary full pressable" href="/chat">
              Продолжить работу
              <ArrowRight size={17} />
            </Link>
            <form action={signOut}>
              <button className="button secondary full pressable" type="submit">
                Выйти из аккаунта
              </button>
            </form>
          </>
        ) : (
          <>
            <div>
              <span className="eyebrow">Сохраните гараж и историю</span>
              <h1>{isSignUp ? "Создать аккаунт" : "Войти в Авто Радар"}</h1>
              <p>
                {isSignUp
                  ? "Только email и пароль — без письма с подтверждением."
                  : "Войдите, чтобы синхронизировать историю и автомобили из гаража."}
              </p>
            </div>
            <nav className="auth-mode-switch" aria-label="Вход или регистрация">
              <Link
                className={!isSignUp ? "active" : ""}
                href="/auth/sign-in"
                aria-current={!isSignUp ? "page" : undefined}
              >
                Вход
              </Link>
              <Link
                className={isSignUp ? "active" : ""}
                href="/auth/sign-in?mode=sign-up"
                aria-current={isSignUp ? "page" : undefined}
              >
                Создать аккаунт
              </Link>
            </nav>
            {params.error ? (
              <div className="auth-error" role="alert">
                {errorMessages[params.error] ?? "Не удалось выполнить вход."}
              </div>
            ) : null}
            <form action={isSignUp ? signUpWithPassword : signInWithPassword}>
              <label>
                Email
                <div className="input-with-icon">
                  <Mail size={18} />
                  <input
                    name="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>
              <label>
                Пароль
                <div className="input-with-icon">
                  <KeyRound size={18} />
                  <input
                    name="password"
                    type="password"
                    placeholder={isSignUp ? "Минимум 8 символов" : "Ваш пароль"}
                    autoComplete={
                      isSignUp ? "new-password" : "current-password"
                    }
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </div>
              </label>
              {isSignUp ? (
                <label>
                  Повторите пароль
                  <div className="input-with-icon">
                    <KeyRound size={18} />
                    <input
                      name="passwordConfirmation"
                      type="password"
                      placeholder="Ещё раз тот же пароль"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </div>
                </label>
              ) : null}
              <button className="button primary full pressable" type="submit">
                {isSignUp ? "Создать аккаунт" : "Войти"}
                <ArrowRight size={17} />
              </button>
            </form>
            <p className="auth-privacy">
              <ShieldCheck size={17} />
              Пароль хранится в защищённом виде в Supabase. Гостевые диалоги и
              гараж будут привязаны к аккаунту.
            </p>
            <Link className="auth-back" href="/chat">
              Продолжить без регистрации
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
