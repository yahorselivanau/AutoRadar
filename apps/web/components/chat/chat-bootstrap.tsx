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
        const payload = (await response.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
          code?: string;
        };
        if (!response.ok || !payload.id) {
          const reason = new Error(
            payload.error ?? "Не удалось начать диалог. Попробуйте ещё раз.",
          );
          reason.name = payload.code ?? "conversation_error";
          throw reason;
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
            <h1>Не удалось начать диалог</h1>
            <p>{error}</p>
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
