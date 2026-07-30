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
  CarFront,
  Check,
  ChevronRight,
  CircleDot,
  FileSearch,
  Hash,
  LoaderCircle,
  Mic,
  MicOff,
  Search,
  Square,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DefaultChatTransport, isToolUIPart } from "ai";

import type { PartsAgentUIMessage } from "@/lib/ai/parts-agent";
import { useGarage } from "@/lib/garage-store";

import { GuestQuotaControl, VehicleSwitcher } from "./chat-context-controls";
import { Bubble, BubbleContent } from "../ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "../ui/marker";
import { Message, MessageContent } from "../ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "../ui/message-scroller";

const suggestions = [
  {
    icon: FileSearch,
    title: "По названию",
    prompt: "Хочу найти запчасть по названию",
  },
  {
    icon: Hash,
    title: "По артикулу",
    prompt: "Хочу найти запчасть по артикулу",
  },
  {
    icon: CarFront,
    title: "По автомобилю или VIN",
    prompt: "Помоги подобрать запчасть по автомобилю или VIN",
  },
];

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const sourceLabels: Record<NormalizedOffer["sourceId"], string> = {
  mock: "Mock",
  armtek: "ARMTEK",
  auto1: "Auto1.by",
  "av-parts": "AV-parts",
  davinagaz: "Davinagaz.by",
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

function formatOfferCount(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "предложение"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "предложения"
        : "предложений";
  return `${count} ${noun}`;
}

function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="typeset typeset-chat assistant-typeset">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

function DraftCard({
  request,
  onSearch,
  onUpdate,
  disabled,
}: {
  request: SearchRequest;
  onSearch: () => void;
  onUpdate: (message: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [partName, setPartName] = useState(request.part.name);
  const [vehicle, setVehicle] = useState(formatVehicle(request.vehicle));

  return (
    <article className="request-card">
      <div className="card-heading">
        <div>
          <span>Готово к поиску</span>
          <h2>{request.part.name}</h2>
        </div>
        <button
          className="request-edit-action pressable"
          type="button"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Отменить" : "Изменить"}
        </button>
      </div>
      {editing ? (
        <div className="request-edit-grid">
          <label>
            Деталь
            <input
              value={partName}
              onChange={(event) => setPartName(event.target.value)}
            />
          </label>
          <label>
            Автомобиль
            <input
              value={vehicle}
              onChange={(event) => setVehicle(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <dl className="request-details">
          <div>
            <dt>Автомобиль</dt>
            <dd>{formatVehicle(request.vehicle)}</dd>
          </div>
          {request.part.rawPartNumber ? (
            <div>
              <dt>Артикул / OEM</dt>
              <dd>{request.part.rawPartNumber}</dd>
            </div>
          ) : null}
          {request.part.side !== "unknown" ||
          request.part.position !== "unknown" ? (
            <div>
              <dt>Сторона / положение</dt>
              <dd>
                {request.part.side === "unknown" ? "—" : request.part.side} ·{" "}
                {request.part.position === "unknown"
                  ? "—"
                  : request.part.position}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
      <div className="request-actions">
        {editing ? (
          <button
            className="button secondary pressable"
            type="button"
            disabled={disabled || !partName.trim()}
            onClick={() => {
              onUpdate(
                `Обнови запрос: деталь — ${partName.trim()}, автомобиль — ${vehicle.trim()}. Пока не запускай поиск.`,
              );
              setEditing(false);
            }}
          >
            <Check size={17} />
            Сохранить изменения
          </button>
        ) : null}
        <button
          className="button primary pressable"
          type="button"
          disabled={disabled || editing}
          onClick={onSearch}
        >
          <Search size={17} />
          Искать
        </button>
      </div>
    </article>
  );
}

function SearchResultCard({
  output,
  conversationId,
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
  conversationId: string;
}) {
  const groups = [
    {
      label: "Новые оригиналы",
      offers: output.offers.filter(
        (offer) =>
          offer.condition === "new" && offer.partKind === "original",
      ),
    },
    {
      label: "Новые аналоги",
      offers: output.offers.filter(
        (offer) => offer.condition === "new" && offer.partKind === "analog",
      ),
    },
    {
      label: "Б/у",
      offers: output.offers.filter((offer) => offer.condition === "used"),
    },
    {
      label: "Другие варианты",
      offers: output.offers.filter(
        (offer) =>
          offer.condition !== "used" &&
          !(offer.condition === "new" && offer.partKind === "original") &&
          !(offer.condition === "new" && offer.partKind === "analog"),
      ),
    },
  ].filter((group) => group.offers.length > 0);
  const prices = output.offers
    .map((offer) => Number(offer.priceAmount))
    .filter((price) => Number.isFinite(price) && price > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const failedSources = output.sources.filter((source) =>
    ["failed", "timeout", "blocked"].includes(source.status),
  ).length;

  return (
    <section className="search-summary-card">
      <article>
        <div className="progress-heading">
          <div>
            <span>Поиск завершён</span>
            <strong>
              {output.offers.length > 0
                ? formatOfferCount(output.offers.length)
                : "Предложений пока нет"}
            </strong>
          </div>
          <span className="summary-status">
            <Check size={15} />
          </span>
        </div>
        {groups.length > 0 ? (
          <div className="search-summary-groups">
            {groups.map((group) => {
              const groupPrices = group.offers
                .map((offer) => Number(offer.priceAmount))
                .filter((price) => Number.isFinite(price) && price > 0);
              return (
                <div key={group.label}>
                  <span>{group.label}</span>
                  <strong className="font-tabular">{group.offers.length}</strong>
                  <small className="font-tabular">
                    {groupPrices.length > 0
                      ? `от ${Math.min(...groupPrices).toFixed(2)} BYN`
                      : "цена на сайте"}
                  </small>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="search-summary-meta">
          {minPrice != null ? (
            <span className="font-tabular">Цены от {minPrice.toFixed(2)} BYN</span>
          ) : null}
          <span>
            {output.sources.length}{" "}
            {output.sources.length === 1 ? "источник" : "источника"}
          </span>
          {failedSources > 0 ? (
            <span>{failedSources} не ответили</span>
          ) : null}
        </div>
        <Link
          className="button primary full pressable"
          href={`/search/${output.jobId}?conversation=${conversationId}`}
        >
          Посмотреть все предложения
          <ChevronRight size={17} />
        </Link>
        <details className="source-details">
          <summary>Как прошёл поиск</summary>
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
        </details>
      </article>
    </section>
  );
}

export function SmartChatExperience({
  conversationId,
  initialConversation = false,
}: {
  conversationId: string;
  initialConversation?: boolean;
}) {
  const { activeVehicle, updateActiveVehicle, setPendingVin } = useGarage();
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(initialConversation);
  const [loadError, setLoadError] = useState("");
  const [guestUsage, setGuestUsage] = useState<GuestUsage | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const initialSpeechText = useRef("");
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
    if (initialConversation) return;
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
  }, [conversationId, initialConversation, setMessages]);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    const supportFrame = window.requestAnimationFrame(() =>
      setSpeechSupported(Boolean(Recognition)),
    );
    if (!Recognition) {
      return () => window.cancelAnimationFrame(supportFrame);
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ru-RU";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      setInput(
        `${initialSpeechText.current}${
          initialSpeechText.current && transcript ? " " : ""
        }${transcript}`.trimStart(),
      );
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    return () => {
      window.cancelAnimationFrame(supportFrame);
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggleSpeech = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    initialSpeechText.current = input.trim();
    setListening(true);
    recognition.start();
  };

  const refreshGuestUsage = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (!response.ok) return;
      const payload = (await response.json()) as ConversationPayload;
      setGuestUsage(payload.guestUsage);
    } catch {
      // The message result remains authoritative; quota copy can refresh later.
    }
  };

  const submitText = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    const vin = findVin(trimmed);
    let text = trimmed;
    if (vin) {
      if (activeVehicle) updateActiveVehicle({ vin });
      else setPendingVin(vin);
      text = activeVehicle
        ? `VIN сохранён приложением для активной машины. Полный номер скрыт. ${
            trimmed.replace(vin, "").trim() ||
            "Подтверди, что данные автомобиля сохранены."
          }`
        : "VIN сохранён приложением локально и скрыт. Попроси меня указать марку, модель и год автомобиля.";
    }
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (initialConversation && window.location.pathname === "/chat") {
      window.history.replaceState({}, "", `/chat/${conversationId}`);
    }
    try {
      await sendMessage({ text });
      window.dispatchEvent(new Event("autoradar:conversations-changed"));
    } catch {
      // useChat exposes the transport error in the conversation UI.
    } finally {
      await refreshGuestUsage();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void submitText(input);
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

  return (
    <section
      className={`chat-page ${
        loaded && messages.length === 0 ? "chat-page-empty" : ""
      }`}
    >
      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition="last-anchor"
        scrollPreviousItemPeek={48}
      >
        <MessageScroller className="chat-transcript">
          <MessageScrollerViewport>
            <MessageScrollerContent aria-busy={busy}>
              {!loaded ? (
                <div className="conversation conversation-loading" role="status">
                  <span className="shimmer-text">Открываю диалог…</span>
                  <div className="message-skeleton" />
                  <div className="message-skeleton short" />
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-copy">
                    <h1>Что нужно найти?</h1>
                    <p>
                      Назовите деталь, артикул или автомобиль.
                    </p>
                  </div>
                  <div className="suggestion-grid">
                    {suggestions.map((suggestion) => {
                      const SuggestionIcon = suggestion.icon;
                      return (
                      <button
                        className="suggestion pressable"
                        key={suggestion.title}
                        type="button"
                        onClick={() => void submitText(suggestion.prompt)}
                      >
                        <span className="suggestion-icon">
                          <SuggestionIcon size={17} />
                        </span>
                        <span>
                          <strong>{suggestion.title}</strong>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="conversation">
                  {messages.map((message) => {
                    const hasClarification = message.parts.some(
                      (part) =>
                        isToolUIPart(part) &&
                        part.type === "tool-ask_clarification" &&
                        part.state === "output-available",
                    );

                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        {message.role === "user" ? (
                          <Message align="end">
                            <MessageContent>
                              <Bubble align="end" variant="secondary">
                                <BubbleContent>
                                  {message.parts
                                    .filter((part) => part.type === "text")
                                    .map((part) => part.text)
                                    .join("")}
                                </BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        ) : (
                          <Message>
                            <MessageContent className="assistant-message">
                              {message.parts.map((part, index) => {
                                if (part.type === "text") {
                                  if (hasClarification) return null;
                                  return (
                                    <AssistantMarkdown
                                      key={`${message.id}-${index}`}
                                    >
                                      {part.text}
                                    </AssistantMarkdown>
                                  );
                                }
                                if (!isToolUIPart(part)) return null;
                                if (part.state !== "output-available") {
                                  return (
                                    <Marker
                                      className="tool-progress"
                                      key={part.toolCallId}
                                      role="status"
                                    >
                                      <MarkerIcon>
                                        <LoaderCircle
                                          className="searching-icon"
                                          size={16}
                                        />
                                      </MarkerIcon>
                                      <MarkerContent>
                                        <span className="shimmer-text">
                                          Уточняю контекст…
                                        </span>
                                      </MarkerContent>
                                    </Marker>
                                  );
                                }

                                if (part.type === "tool-update_search_draft") {
                                  return (
                                    <DraftCard
                                      key={part.toolCallId}
                                      request={part.output.request}
                                      disabled={busy}
                                      onUpdate={(message) =>
                                        void submitText(message)
                                      }
                                      onSearch={() =>
                                        void submitText(
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
                                      <span className="structured-label">
                                        Нужно уточнение
                                      </span>
                                      <h2>{part.output.question}</h2>
                                      <div className="clarification-options">
                                        {part.output.options.map((option) => (
                                          <button
                                            className="clarification-option pressable"
                                            key={option}
                                            type="button"
                                            disabled={busy}
                                            onClick={() =>
                                              void submitText(option)
                                            }
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
                                  if (
                                    part.output.kind === "guest_quota_exceeded"
                                  ) {
                                    return (
                                      <aside
                                        className="guest-limit-card"
                                        key={part.toolCallId}
                                      >
                                        <strong>
                                          Бесплатные поиски закончились
                                        </strong>
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
                                        conversationId={conversationId}
                                      />
                                    );
                                  }
                                }
                                return null;
                              })}
                            </MessageContent>
                          </Message>
                        )}
                      </MessageScrollerItem>
                    );
                  })}
                  {busy ? (
                    <MessageScrollerItem>
                      <Marker className="assistant-thinking" role="status">
                        <MarkerIcon>
                          <LoaderCircle className="searching-icon" size={16} />
                        </MarkerIcon>
                        <MarkerContent>
                          <span className="shimmer-text">
                            Понимаю запрос и выбираю следующий шаг
                          </span>
                        </MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  ) : null}
                  {error ? (
                    <MessageScrollerItem>
                      <div className="compatibility-warning" aria-live="polite">
                        <CircleDot size={20} />
                        <p>
                          <strong>Ответ не получен.</strong> {error.message}
                        </p>
                      </div>
                    </MessageScrollerItem>
                  ) : null}
                </div>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>

        <form className="composer-wrap" onSubmit={submit}>
          {guestUsage && guestUsage.searchesUsed >= 2 ? (
            <div className="composer-notice">
              <span>Поиск по реальным каталогам</span>
              <GuestQuotaControl usage={guestUsage} />
            </div>
          ) : null}
          <div className="composer">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              placeholder="Опишите деталь или задайте вопрос…"
              aria-label="Сообщение Авто Радар"
              disabled={busy}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "0px";
                event.target.style.height = `${Math.min(
                  event.target.scrollHeight,
                  180,
                )}px`;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void submitText(input);
                }
              }}
            />
            <div className="composer-actions">
              <div className="composer-tools">
                <VehicleSwitcher />
              </div>
              <div className="composer-primary-actions">
                <button
                  className={`composer-icon pressable ${
                    listening ? "is-listening" : ""
                  }`}
                  type="button"
                  aria-label={
                    listening ? "Остановить диктовку" : "Продиктовать запрос"
                  }
                  title={
                    speechSupported
                      ? "Продиктовать запрос"
                      : "Диктовка не поддерживается этим браузером"
                  }
                  disabled={!speechSupported || busy}
                  onClick={toggleSpeech}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
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
          </div>
        </form>
      </MessageScrollerProvider>
    </section>
  );
}
