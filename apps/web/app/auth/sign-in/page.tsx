import { ArrowRight, Mail, ShieldCheck, X } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { sendMagicLink } from "./actions";

const errorMessages: Record<string, string> = {
  invalid_email: "Проверьте адрес электронной почты.",
  auth_not_configured: "Вход ещё не настроен для этого окружения.",
  send_failed: "Не удалось отправить письмо. Попробуйте через минуту.",
  callback_failed: "Ссылка устарела или уже использована. Запросите новую.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
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
        <div>
          <span className="eyebrow">Сохраните гараж и историю</span>
          <h1>Войти в Авто Радар</h1>
          <p>
            Гостевой режим даёт несколько полноценных поисков. После входа
            ограничения снимаются, а история и гараж синхронизируются.
          </p>
        </div>
        {params.sent === "1" ? (
          <div className="auth-success" role="status">
            Проверьте почту. Мы отправили одноразовую ссылку для входа.
          </div>
        ) : null}
        {params.error ? (
          <div className="auth-error" role="alert">
            {errorMessages[params.error] ?? "Не удалось выполнить вход."}
          </div>
        ) : null}
        <form action={sendMagicLink}>
          <label>
            Электронная почта
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
          <button className="button primary full pressable" type="submit">
            Получить ссылку для входа
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-privacy">
          <ShieldCheck size={17} />
          Текущие гостевые диалоги будут перенесены в аккаунт. Полный VIN не
          отправляется AI-модели.
        </p>
        <Link className="auth-back" href="/chat">
          Продолжить без регистрации
        </Link>
      </section>
    </main>
  );
}
