"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ChatBootstrap() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          id?: string;
          error?: string;
        };
        if (!response.ok || !payload.id) {
          throw new Error(payload.error ?? "Не удалось начать диалог.");
        }
        if (!cancelled) router.replace(`/chat/${payload.id}`);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось начать диалог.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <section className="chat-page">
      <div className="empty-chat" aria-live="polite">
        {error ? (
          <>
            <h1>Нужен вход</h1>
            <p>{error}</p>
            <a className="button primary pressable" href="/auth/sign-in">
              Войти или создать аккаунт
            </a>
          </>
        ) : (
          <>
            <LoaderCircle className="searching-icon" size={28} />
            <p>Создаю новый диалог…</p>
          </>
        )}
      </div>
    </section>
  );
}
