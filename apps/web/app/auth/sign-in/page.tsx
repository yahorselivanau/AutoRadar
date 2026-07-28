import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Wordmark />
        <div>
          <span className="eyebrow">Сохраните гараж и историю</span>
          <h1>Войти в AutoRadar</h1>
          <p>
            Поиск работает и без аккаунта. Вход нужен только для синхронизации
            автомобилей и запросов.
          </p>
        </div>
        <form>
          <label>
            Электронная почта
            <div className="input-with-icon">
              <Mail size={18} />
              <input type="email" placeholder="name@example.com" />
            </div>
          </label>
          <button className="button primary full pressable" type="submit">
            Продолжить
            <ArrowRight size={17} />
          </button>
        </form>
        <Link className="auth-back" href="/chat">
          Продолжить без регистрации
        </Link>
      </section>
    </main>
  );
}
