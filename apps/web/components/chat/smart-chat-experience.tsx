"use client";

import type {
  GuestUsage,
  NormalizedOffer,
  SearchRequest,
  SearchSourceProgress,
  VehicleContext,
} from "@autoradar/domain";
import { normalizeVin, VinSchema } from "@autoradar/domain";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Square,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DefaultChatTransport, isToolUIPart } from "ai";

import type { PartsAgentUIMessage } from "@/lib/ai/parts-agent";
import { useGarage } from "@/lib/garage-store";

const suggestions = [
  "Передний левый стеклоподъёмник на Peugeot 308 2008, 5 дверей",
  "Найди по артикулу 7700274177",
  "Нужен капот б/у на BMW 3 F30",
];

const sourceLabels: Record<NormalizedOffer["sourceId"], string> = {
  mock: "Mock",
  armtek: "ARMTEK",
  auto1: "Auto1.by",
  "av-parts": "AV-parts",
  motorland: "Motorland.by",
  remzona: "Remzona",
  zap: "Zap.by",
};

const sourceStatusLabels: Record<SearchSourceProgress["status"], string> = {
  queued: "В очереди",
  running: "Ищет",
  completed: "Готово",
  empty: "Ничего не найдено",
  timeout: "Таймаут",
  blocked: "Недоступен",
  failed: "Ошибка",
  disabled: "Отключён",
};

type ConversationPayload = {
  id: string;
  messages: PartsAgentUIMessage[];
  guestUsage: GuestUsage | null;
};

function toVehicleContext(
  activeVehicle: ReturnType<typeof useGarage>["activeVehicle"],
): VehicleContext | null {
  if (!activeVehicle) return null;
  return {
    make: activeVehicle.make,
    model: activeVehicle.model,
    year: activeVehicle.year,
    generation: activeVehicle.generation,
    body: activeVehicle.body,
    engine: activeVehicle.engine,
    transmission: activeVehicle.transmission,
    doors: activeVehicle.doors,
  };
}

function findVin(value: string): string | null {
  const compact = normalizeVin(value);
  const direct = VinSchema.safeParse(compact);
  if (direct.success) return direct.data;
  const match = value.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  if (!match) return null;
  const parsed = VinSchema.safeParse(match[0]);
  return parsed.success ? parsed.data : null;
}

function formatVehicle(vehicle: SearchRequest["vehicle"]) {
  if (!vehicle) return "Автомобиль не указан";
  return [
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.generation,
    vehicle.body,
    vehicle.engine,
    vehicle.doors ? `${vehicle.doors} дверей` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function GuestUsageNotice({ usage }: { usage: GuestUsage }) {
  const searchesLeft = Math.max(usage.searchesLimit - usage.searchesUsed, 0);
  const shouldShow =
    searchesLeft <= 2 ||
    usage.conversationsUsed >= usage.conversationsLimit - 1;
  if (!shouldShow) return null;

  return (
    <aside className="guest-usage-card" aria-live="polite">
      <div>
        <strong>
          {searchesLeft > 0
            ? `Осталось бесплатных поисков: ${searchesLeft}`
            : "Новые поиски доступны после входа"}
        </strong>
        <p>
          История и найденные предложения не пропадут. Аккаунт также
          синхронизирует гараж между устройствами.
        </p>
      </div>
      <Link className="button secondary pressable" href="/auth/sign-in">
        <UserRound size={17} />
        Войти
      </Link>
    </aside>
  );
}

function DraftCard({
  request,
  onSearch,
  disabled,
}: {
  request: SearchRequest;
  onSearch: () => void;
  disabled: boolean;
}) {
  return (
    <article className="request-card">
      <div className="card-heading">
        <div>
          <span>Текущий запрос</span>
          <h2>{request.part.name}</h2>
        </div>
        <span className="confidence-badge">
          <Check size={14} /> Контекст сохранён
        </span>
      </div>
      <dl className="request-details">
        <div>
          <dt>Автомобиль</dt>
          <dd>{formatVehicle(request.vehicle)}</dd>
        </div>
        <div>
          <dt>Артикул / OEM</dt>
          <dd>{request.part.rawPartNumber ?? "Не указан"}</dd>
        </div>
        <div>
          <dt>Сторона / положение</dt>
          <dd>
            {request.part.side === "unknown" ? "—" : request.part.side} ·{" "}
            {request.part.position === "unknown" ? "—" : request.part.position}
          </dd>
        </div>
      </dl>
      <p className="request-note">
        Напишите исправление обычным сообщением — агент обновит эту карточку,
        сохранив остальной контекст.
      </p>
      <div className="request-actions">
        <button
          className="button primary pressable"
          type="button"
          disabled={disabled}
          onClick={onSearch}
        >
          <Search size={17} />
          Искать
        </button>
      </div>
    </article>
  );
}

function OfferCard({ offer }: { offer: NormalizedOffer }) {
  return (
    <article className="offer-card">
      {offer.imageUrl ? (
        <div className="offer-media">
          <Image
            className="media-outline"
            src={offer.imageUrl}
            alt={offer.title}
            width={176}
            height={132}
            unoptimized
          />
        </div>
      ) : (
        <div className="offer-media offer-media-empty">
          <Search aria-hidden="true" size={24} />
        </div>
      )}
      <div className="offer-main">
        <div className="offer-badges">
          <span className="offer-badge confirmed">
            {sourceLabels[offer.sourceId]}
          </span>
          <span
            className={`offer-badge ${
              offer.matchStatus === "confirmed" ? "confirmed" : "unknown"
            }`}
          >
            {offer.matchStatus === "confirmed"
              ? "Подтверждено источником"
              : "Нужно проверить"}
          </span>
        </div>
        <span className="offer-brand">{offer.brand ?? "Бренд не указан"}</span>
        <h2>{offer.title}</h2>
        <span className="part-number">
          Артикул: {offer.rawPartNumber ?? "не указан"}
        </span>
      </div>
      <div className="offer-logistics">
        <span>
          <MapPin size={15} />
          {offer.availability ?? offer.location ?? "Наличие не указано"}
        </span>
        {offer.deliveryText ? (
          <span>Доставка: {offer.deliveryText}</span>
        ) : null}
      </div>
      <div className="offer-action">
        <span className="price font-tabular">
          {offer.priceAmount ? `${offer.priceAmount} BYN` : "Цена на сайте"}
        </span>
        <small>Проверьте совместимость, цену и наличие у продавца.</small>
        <a
          className="button primary pressable"
          href={offer.externalUrl}
          target="_blank"
          rel="noreferrer"
        >
          Открыть на {sourceLabels[offer.sourceId]}
          <ExternalLink size={16} />
        </a>
      </div>
    </article>
  );
}

function SearchResultCard({
  output,
}: {
  output: {
    jobId: string;
    status: string;
    offers: NormalizedOffer[];
    sources: SearchSourceProgress[];
    clarification?: {
      question: string;
      options: Array<{ id: string; label: string; value: unknown }>;
    } | null;
  };
}) {
  return (
    <section className="search-result-block">
      <article className="progress-card">
        <div className="progress-heading">
          <div>
            <span>Поиск сохранён</span>
            <strong>
              {output.offers.length > 0
                ? `Найдено предложений: ${output.offers.length}`
                : "Предложений пока нет"}
            </strong>
          </div>
          <CircleDot size={22} />
        </div>
        <div className="source-progress-list">
          {output.sources.map((source) => (
            <div key={source.sourceId}>
              <span>{sourceLabels[source.sourceId]}</span>
              <span>
                {sourceStatusLabels[source.status]}
                {source.offerCount > 0 ? ` · ${source.offerCount}` : ""}
              </span>
            </div>
          ))}
        </div>
      </article>
      {output.offers.length > 0 ? (
        <div className="offer-list">
          {output.offers.map((offer) => (
            <OfferCard
              key={`${offer.sourceId}-${offer.externalId}`}
              offer={offer}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SmartChatExperience({
  conversationId,
}: {
  conversationId: string;
}) {
  const { activeVehicle, updateActiveVehicle, setPendingVin } = useGarage();
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [guestUsage, setGuestUsage] = useState<GuestUsage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const vehicleContext = useMemo(
    () => toVehicleContext(activeVehicle),
    [activeVehicle],
  );
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: {
            id,
            message: messages.at(-1),
            activeVehicle: vehicleContext,
          },
        }),
      }),
    [vehicleContext],
  );
  const { messages, setMessages, sendMessage, status, stop, error } =
    useChat<PartsAgentUIMessage>({
      id: conversationId,
      transport,
    });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/conversations/${conversationId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ConversationPayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Диалог не найден.");
        }
        setMessages(payload.messages);
        setGuestUsage(payload.guestUsage);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          reason instanceof Error ? reason.message : "Диалог не найден.",
        );
      });
    return () => controller.abort();
  }, [conversationId, setMessages]);

  const submitText = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    const vin = findVin(trimmed);
    if (vin) {
      if (activeVehicle) updateActiveVehicle({ vin });
      else setPendingVin(vin);
      void sendMessage({
        text: activeVehicle
          ? `VIN сохранён приложением для активной машины. Полный номер скрыт. ${
              trimmed.replace(vin, "").trim() ||
              "Подтверди, что данные автомобиля сохранены."
            }`
          : "VIN сохранён приложением локально и скрыт. Попроси меня указать марку, модель и год автомобиля.",
      });
      setInput("");
      return;
    }
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitText(input);
  };

  if (loadError) {
    return (
      <section className="chat-page">
        <div className="empty-chat">
          <h1>Диалог недоступен</h1>
          <p>{loadError}</p>
          <Link className="button primary pressable" href="/chat">
            Начать новый
          </Link>
        </div>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="chat-page">
        <div className="empty-chat" aria-live="polite">
          <LoaderCircle className="searching-icon" size={28} />
          <p>Восстанавливаю контекст диалога…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-page">
      <div className="chat-scroll">
        {guestUsage ? <GuestUsageNotice usage={guestUsage} /> : null}
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-copy">
              <span className="eyebrow">
                <Sparkles size={15} />
                AI-подбор с памятью
              </span>
              <h1>Какую запчасть ищем?</h1>
              <p>
                Опишите задачу своими словами. Я сохраню машину и параметры,
                уточню только важное и сам выберу, когда нужен поиск.
              </p>
            </div>
            <div className="suggestion-grid">
              {suggestions.map((suggestion) => (
                <button
                  className="suggestion pressable"
                  key={suggestion}
                  type="button"
                  onClick={() => submitText(suggestion)}
                >
                  <CircleDot size={16} />
                  <span>{suggestion}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            <p className="privacy-note">
              Web search выключен. Полный VIN не передаётся модели.
            </p>
          </div>
        ) : (
          <div className="conversation">
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="user-message">
                    {message.parts
                      .filter((part) => part.type === "text")
                      .map((part) => part.text)
                      .join("")}
                  </div>
                ) : (
                  <div className="assistant-block">
                    <span className="assistant-kicker">
                      <Sparkles size={15} /> Авто Радар
                    </span>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <p key={`${message.id}-${index}`}>{part.text}</p>
                        );
                      }
                      if (!isToolUIPart(part)) return null;
                      if (part.state !== "output-available") {
                        return (
                          <div
                            className="tool-progress"
                            key={part.toolCallId}
                            aria-live="polite"
                          >
                            <LoaderCircle
                              className="searching-icon"
                              size={18}
                            />
                            Работаю с контекстом…
                          </div>
                        );
                      }

                      if (part.type === "tool-update_search_draft") {
                        return (
                          <DraftCard
                            key={part.toolCallId}
                            request={part.output.request}
                            disabled={busy}
                            onSearch={() =>
                              submitText(
                                "Ищи по текущему подтверждённому запросу.",
                              )
                            }
                          />
                        );
                      }
                      if (part.type === "tool-ask_clarification") {
                        return (
                          <article
                            className="clarification-card"
                            key={part.toolCallId}
                          >
                            <h2>{part.output.question}</h2>
                            <div className="clarification-options">
                              {part.output.options.map((option) => (
                                <button
                                  className="clarification-option pressable"
                                  key={option}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => submitText(option)}
                                >
                                  <span>{option}</span>
                                  <ChevronRight size={17} />
                                </button>
                              ))}
                            </div>
                          </article>
                        );
                      }
                      if (
                        part.type === "tool-start_parts_search" ||
                        part.type === "tool-get_search_results"
                      ) {
                        if (part.output.kind === "guest_quota_exceeded") {
                          return (
                            <aside
                              className="guest-limit-card"
                              key={part.toolCallId}
                            >
                              <strong>Бесплатные поиски закончились</strong>
                              <p>{part.output.message}</p>
                              <Link
                                className="button primary pressable"
                                href="/auth/sign-in"
                              >
                                Войти и продолжить
                              </Link>
                            </aside>
                          );
                        }
                        if (part.output.kind === "search_result") {
                          return (
                            <SearchResultCard
                              key={part.toolCallId}
                              output={part.output}
                            />
                          );
                        }
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            ))}
            {busy ? (
              <div className="assistant-block" aria-live="polite">
                <span className="assistant-kicker">
                  <LoaderCircle className="searching-icon" size={15} />
                  Авто Радар
                </span>
                <p>Понимаю контекст и выбираю следующий шаг…</p>
              </div>
            ) : null}
            {error ? (
              <div className="compatibility-warning" aria-live="polite">
                <CircleDot size={20} />
                <p>
                  <strong>Ответ не получен.</strong> {error.message}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form className="composer-wrap" onSubmit={submit}>
        <div className="composer">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            placeholder="Опишите деталь или задайте вопрос по результатам…"
            aria-label="Сообщение Авто Радар"
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submitText(input);
              }
            }}
          />
          <div className="composer-context">
            <span>
              {activeVehicle
                ? `${activeVehicle.make} ${activeVehicle.model} · ${activeVehicle.year}`
                : "Без выбранной машины"}
            </span>
            {busy ? (
              <button
                className="submit-button pressable"
                type="button"
                aria-label="Остановить ответ"
                onClick={stop}
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                className="submit-button pressable"
                type="submit"
                disabled={!input.trim()}
                aria-label="Отправить"
              >
                <ArrowUp size={19} />
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
