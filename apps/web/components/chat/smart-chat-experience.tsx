"use client";

import type {
  GuestUsage,
  NormalizedOffer,
  SearchRequest,
  SearchSourceProgress,
  VehicleCandidate,
  VehicleContext,
  VinResolution,
} from "@autoradar/domain";
import {
  normalizeVin,
  VinResolutionSchema,
  VinSchema,
} from "@autoradar/domain";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  AlertCircle,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileSearch,
  Hash,
  LoaderCircle,
  Mic,
  MicOff,
  Search,
  SearchX,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
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
  const [make, setMake] = useState(request.vehicle?.make ?? "");
  const [model, setModel] = useState(request.vehicle?.model ?? "");
  const [year, setYear] = useState(
    request.vehicle?.year && request.vehicle.year >= 1950
      ? String(request.vehicle.year)
      : "",
  );
  const [generation, setGeneration] = useState(
    request.vehicle?.generation ?? "",
  );
  const [body, setBody] = useState(request.vehicle?.body ?? "");
  const [engine, setEngine] = useState(request.vehicle?.engine ?? "");
  const [side, setSide] = useState(request.part.side);
  const [position, setPosition] = useState(request.part.position);
  const [condition, setCondition] = useState(request.part.condition);
  const currentYear = new Date().getUTCFullYear() + 1;
  const parsedYear = year ? Number(year) : undefined;
  const yearValid =
    parsedYear == null ||
    (Number.isInteger(parsedYear) &&
      parsedYear >= 1950 &&
      parsedYear <= currentYear);
  const vehicleValid =
    (!make && !model) || Boolean(make.trim() && model.trim());

  const saveDraft = () => {
    const vehicleFields = [
      make.trim() ? `марка — ${make.trim()}` : null,
      model.trim() ? `модель — ${model.trim()}` : null,
      parsedYear ? `год — ${parsedYear}` : null,
      generation.trim() ? `поколение — ${generation.trim()}` : null,
      body.trim() ? `кузов — ${body.trim()}` : null,
      engine.trim() ? `двигатель — ${engine.trim()}` : null,
    ].filter(Boolean);
    const partFields = [
      `деталь — ${partName.trim()}`,
      `сторона — ${side}`,
      `положение — ${position}`,
      `состояние — ${condition}`,
    ];
    onUpdate(
      `Обнови текущий запрос по этим подтверждённым полям: ${[
        ...partFields,
        ...vehicleFields,
      ].join(", ")}. Пустые поля не выдумывай. Пока не запускай поиск.`,
    );
    setEditing(false);
  };

  return (
    <article className="request-card">
      <div className="card-heading">
        <div>
          <span>Запрос на подбор</span>
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
        <div className="request-editor">
          <div className="request-editor-section">
            <div className="request-editor-heading">
              <strong>Деталь</strong>
              <span>Уточните только известные параметры</span>
            </div>
            <div className="request-edit-grid">
              <label className="request-field request-field-wide">
                <span>Название</span>
                <input
                  value={partName}
                  onChange={(event) => setPartName(event.target.value)}
                />
              </label>
              <label className="request-field">
                <span>Положение</span>
                <select
                  value={position}
                  onChange={(event) =>
                    setPosition(
                      event.target.value as SearchRequest["part"]["position"],
                    )
                  }
                >
                  <option value="unknown">Не указано</option>
                  <option value="front">Спереди</option>
                  <option value="rear">Сзади</option>
                </select>
              </label>
              <label className="request-field">
                <span>Сторона</span>
                <select
                  value={side}
                  onChange={(event) =>
                    setSide(event.target.value as SearchRequest["part"]["side"])
                  }
                >
                  <option value="unknown">Не указана</option>
                  <option value="left">Слева</option>
                  <option value="right">Справа</option>
                </select>
              </label>
              <label className="request-field">
                <span>Состояние</span>
                <select
                  value={condition}
                  onChange={(event) =>
                    setCondition(
                      event.target.value as SearchRequest["part"]["condition"],
                    )
                  }
                >
                  <option value="any">Любое</option>
                  <option value="new">Новое</option>
                  <option value="used">Б/у</option>
                </select>
              </label>
            </div>
          </div>
          <div className="request-editor-section">
            <div className="request-editor-heading">
              <strong>Автомобиль</strong>
              <span>Год и версия необязательны</span>
            </div>
            <div className="request-edit-grid">
              <label className="request-field">
                <span>Марка</span>
                <input
                  value={make}
                  onChange={(event) => setMake(event.target.value)}
                  placeholder="Peugeot"
                />
              </label>
              <label className="request-field">
                <span>Модель</span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="308"
                />
              </label>
              <label className="request-field">
                <span>Год</span>
                <input
                  value={year}
                  onChange={(event) =>
                    setYear(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  inputMode="numeric"
                  placeholder="2008"
                />
              </label>
              <label className="request-field">
                <span>Поколение</span>
                <input
                  value={generation}
                  onChange={(event) => setGeneration(event.target.value)}
                  placeholder="T7"
                />
              </label>
              <label className="request-field">
                <span>Кузов</span>
                <input
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Хэтчбек"
                />
              </label>
              <label className="request-field">
                <span>Двигатель</span>
                <input
                  value={engine}
                  onChange={(event) => setEngine(event.target.value)}
                  placeholder="1.6 VTi"
                />
              </label>
            </div>
          </div>
          {!vehicleValid || !yearValid ? (
            <p className="request-validation" role="alert">
              <AlertCircle size={15} />
              {!vehicleValid
                ? "Укажите марку и модель вместе."
                : `Год должен быть от 1950 до ${currentYear}.`}
            </p>
          ) : null}
        </div>
      ) : (
        <dl className="request-details">
          <div>
            <dt>Деталь</dt>
            <dd>{request.part.name}</dd>
          </div>
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
              <dt>Расположение</dt>
              <dd>
                {request.part.position === "front"
                  ? "Спереди"
                  : request.part.position === "rear"
                    ? "Сзади"
                    : "Положение не указано"}
                {" · "}
                {request.part.side === "left"
                  ? "слева"
                  : request.part.side === "right"
                    ? "справа"
                    : "сторона не указана"}
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
            disabled={
              disabled || !partName.trim() || !vehicleValid || !yearValid
            }
            onClick={saveDraft}
          >
            <Check size={17} />
            Сохранить
          </button>
        ) : null}
        <button
          className="button primary pressable"
          type="button"
          disabled={disabled || editing}
          onClick={onSearch}
        >
          <Search size={17} />
          Найти предложения
        </button>
      </div>
    </article>
  );
}

function VehicleResolutionCard({
  resolution,
  candidate,
  disabled,
  onConfirm,
}: {
  resolution: VinResolution;
  candidate: VehicleCandidate | null;
  disabled: boolean;
  onConfirm: (vehicle: VehicleContext) => void;
}) {
  const [make, setMake] = useState(candidate?.make ?? "");
  const [model, setModel] = useState(candidate?.model ?? "");
  const [year, setYear] = useState(
    candidate?.year ? String(candidate.year) : "",
  );
  const [generation, setGeneration] = useState(candidate?.generation ?? "");
  const [body, setBody] = useState(candidate?.body ?? "");
  const [engine, setEngine] = useState(candidate?.engine ?? "");
  const parsedYear = Number(year);
  const valid = Boolean(
    make.trim() &&
    model.trim() &&
    Number.isInteger(parsedYear) &&
    parsedYear >= 1886 &&
    parsedYear <= 2200,
  );

  return (
    <article className="request-card" aria-label="Подтверждение автомобиля">
      <div className="card-heading">
        <div>
          <span>
            {resolution.status === "resolved"
              ? "Автомобиль распознан"
              : "Нужно дополнить автомобиль"}
          </span>
          <h2>{resolution.maskedVin}</h2>
        </div>
        <span
          className="summary-status"
          data-state={valid ? "success" : "empty"}
        >
          {valid ? <Check size={15} /> : <AlertCircle size={16} />}
        </span>
      </div>
      <p className="search-empty-note">
        vPIC помогает определить автомобиль, но не подтверждает применяемость
        деталей. Проверьте поля перед сохранением.
      </p>
      <div className="request-edit-grid">
        <label className="request-field">
          <span>Марка</span>
          <input
            value={make}
            onChange={(event) => setMake(event.target.value)}
          />
        </label>
        <label className="request-field">
          <span>Модель</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        <label className="request-field">
          <span>Год</span>
          <input
            inputMode="numeric"
            value={year}
            onChange={(event) =>
              setYear(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
        </label>
        <label className="request-field">
          <span>Поколение</span>
          <input
            value={generation}
            onChange={(event) => setGeneration(event.target.value)}
          />
        </label>
        <label className="request-field">
          <span>Кузов</span>
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <label className="request-field">
          <span>Двигатель</span>
          <input
            value={engine}
            onChange={(event) => setEngine(event.target.value)}
          />
        </label>
      </div>
      <button
        className="button primary full pressable"
        type="button"
        disabled={disabled || !valid}
        onClick={() =>
          onConfirm({
            make: make.trim(),
            model: model.trim(),
            year: parsedYear,
            generation: generation.trim() || undefined,
            body: body.trim() || undefined,
            engine: engine.trim() || undefined,
          })
        }
      >
        <Check size={17} />
        Подтвердить автомобиль
      </button>
    </article>
  );
}

function SearchResultCard({
  output,
  conversationId,
  onClarify,
}: {
  output: {
    jobId: string;
    status: string;
    offers: NormalizedOffer[];
    sources: SearchSourceProgress[];
    clarification?: {
      id: string;
      question: string;
      field?: string;
      options: Array<{ id: string; label: string; value: unknown }>;
    } | null;
  };
  conversationId: string;
  onClarify: (message: string) => void;
}) {
  const groups = [
    {
      label: "Подтверждено источником",
      offers: output.offers.filter(
        (offer) => offer.matchStatus === "confirmed",
      ),
    },
    {
      label: "Возможно подходит",
      offers: output.offers.filter(
        (offer) => offer.matchStatus !== "confirmed",
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
  const hasOffers = output.offers.length > 0;

  return (
    <section
      className="search-summary-card"
      data-state={hasOffers ? "results" : "empty"}
    >
      <article>
        <div className="progress-heading">
          <div>
            <span>Поиск завершён</span>
            <strong>
              {hasOffers
                ? formatOfferCount(output.offers.length)
                : "Ничего не найдено"}
            </strong>
          </div>
          <span
            className="summary-status"
            data-state={hasOffers ? "success" : "empty"}
          >
            {hasOffers ? <Check size={15} /> : <SearchX size={16} />}
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
                  <strong className="font-tabular">
                    {group.offers.length}
                  </strong>
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
            <span className="font-tabular">
              Цены от {minPrice.toFixed(2)} BYN
            </span>
          ) : null}
          <span>
            {output.sources.length}{" "}
            {output.sources.length === 1 ? "источник" : "источника"}
          </span>
          {failedSources > 0 ? <span>{failedSources} не ответили</span> : null}
        </div>
        {hasOffers ? (
          <Link
            className="button primary full pressable"
            href={`/search/${output.jobId}?conversation=${conversationId}`}
          >
            Посмотреть предложения
            <ChevronRight size={17} />
          </Link>
        ) : (
          <p className="search-empty-note">
            Проверьте параметры автомобиля или измените запрос.
          </p>
        )}
        {output.clarification ? (
          <div className="search-clarification">
            <span className="structured-label">Уточните автомобиль</span>
            <strong>{output.clarification.question}</strong>
            <div className="clarification-options">
              {output.clarification.options.map((option) => (
                <button
                  className="clarification-option pressable"
                  key={option.id}
                  type="button"
                  onClick={() =>
                    onClarify(
                      `Примени уточнение ${output.clarification?.id}: вариант ${option.id} («${option.label}»). Пока не запускай новый поиск.`,
                    )
                  }
                >
                  <span>{option.label}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <details className="source-details">
          <summary>
            <span>Источники поиска</span>
            <ChevronDown size={16} />
          </summary>
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
  const {
    activeVehicle,
    saveVehicle,
    updateActiveVehicle,
    setPendingVin,
    clearPendingVin,
  } = useGarage();
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(initialConversation);
  const [loadError, setLoadError] = useState("");
  const [guestUsage, setGuestUsage] = useState<GuestUsage | null>(null);
  const [limitPromptDismissed, setLimitPromptDismissed] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [vinResolution, setVinResolution] = useState<VinResolution | null>(
    null,
  );
  const [pendingRawVin, setPendingRawVin] = useState<string | null>(null);
  const [vinResolving, setVinResolving] = useState(false);
  const [vinResolutionError, setVinResolutionError] = useState("");
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
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: {
            id,
            message: messages.at(-1),
            activeVehicle: vehicleContext,
            vehicleConfirmationPending:
              body?.vehicleConfirmationPending === true,
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
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
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
      setPendingVin(vin);
      setPendingRawVin(vin);
      setVinResolving(true);
      setVinResolutionError("");
      try {
        const response = await fetch("/api/vehicles/resolve-vin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vin }),
        });
        if (!response.ok) throw new Error("resolver_unavailable");
        const payload = (await response.json()) as unknown;
        const parsed = VinResolutionSchema.safeParse(payload);
        if (!parsed.success) throw new Error("invalid_resolver_response");
        setVinResolution(parsed.data);
      } catch {
        setVinResolutionError(
          "Не удалось распознать VIN автоматически. Заполните автомобиль вручную в гараже.",
        );
      } finally {
        setVinResolving(false);
      }
      text = activeVehicle
        ? `Приложение распознаёт VIN для подтверждения автомобиля. Полный номер скрыт. ${
            trimmed.replace(vin, "").trim() || "Пока не запускай поиск."
          }`
        : `Приложение распознаёт VIN локально и покажет карточку подтверждения. Полный номер скрыт. ${
            trimmed.replace(vin, "").trim() || "Пока не запускай поиск."
          }`;
    }
    flushSync(() => setInput(""));
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (initialConversation && window.location.pathname === "/chat") {
      window.history.replaceState({}, "", `/chat/${conversationId}`);
    }
    try {
      await sendMessage(
        { text },
        { body: { vehicleConfirmationPending: Boolean(vin) } },
      );
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
                <div
                  className="conversation conversation-loading"
                  role="status"
                >
                  <span className="shimmer-text">Открываю диалог…</span>
                  <div className="message-skeleton" />
                  <div className="message-skeleton short" />
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-copy">
                    <h1>Что нужно найти?</h1>
                    <p>Назовите деталь, артикул или автомобиль.</p>
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
                                if (
                                  part.type === "tool-select_part_hypothesis" &&
                                  part.output.kind === "search_draft"
                                ) {
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
                                if (part.type === "tool-assess_symptom") {
                                  const assessment = part.output.assessment;
                                  return (
                                    <article
                                      className="clarification-card"
                                      key={part.toolCallId}
                                    >
                                      <span className="structured-label">
                                        Возможные причины
                                      </span>
                                      {assessment.safetyMessage ? (
                                        <div className="compatibility-warning">
                                          <AlertCircle size={20} />
                                          <p>
                                            <strong>
                                              {assessment.safetySeverity ===
                                              "stop_driving"
                                                ? "Не продолжайте движение."
                                                : "Нужна осторожность."}
                                            </strong>{" "}
                                            {assessment.safetyMessage}
                                          </p>
                                        </div>
                                      ) : null}
                                      {assessment.nextQuestion ? (
                                        <h2>{assessment.nextQuestion}</h2>
                                      ) : (
                                        <h2>
                                          Выберите узел для поиска или
                                          обратитесь на диагностику
                                        </h2>
                                      )}
                                      <div className="clarification-options">
                                        {assessment.hypotheses.map(
                                          (hypothesis) => (
                                            <button
                                              className="clarification-option pressable"
                                              key={hypothesis.id}
                                              type="button"
                                              disabled={busy}
                                              onClick={() =>
                                                void submitText(
                                                  `Выбираю гипотезу ${hypothesis.id}: ${hypothesis.label}. Подготовь карточку детали, но поиск пока не запускай.`,
                                                )
                                              }
                                            >
                                              <span>
                                                <strong>
                                                  {hypothesis.label}
                                                </strong>
                                                <small>
                                                  {hypothesis.explanation}
                                                </small>
                                              </span>
                                              <ChevronRight size={17} />
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    </article>
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
                                  if (part.output.kind === "search_progress") {
                                    const event = part.output.event;
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
                                          {event.kind === "search_started"
                                            ? `Ищу в ${event.sourceIds.length} источниках…`
                                            : `${sourceLabels[event.source.sourceId]}: ${sourceStatusLabels[event.source.status]}${
                                                event.source.offerCount
                                                  ? ` · ${event.source.offerCount}`
                                                  : ""
                                              }`}
                                        </MarkerContent>
                                      </Marker>
                                    );
                                  }
                                  if (part.output.kind === "search_result") {
                                    return (
                                      <SearchResultCard
                                        key={part.toolCallId}
                                        output={part.output}
                                        conversationId={conversationId}
                                        onClarify={(message) =>
                                          void submitText(message)
                                        }
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
          <div
            className={`composer-frame ${
              guestUsage && guestUsage.searchesUsed >= 2
                ? "has-usage-notice"
                : ""
            }`}
          >
            {vinResolving ? (
              <Marker className="tool-progress" role="status">
                <MarkerIcon>
                  <LoaderCircle className="searching-icon" size={16} />
                </MarkerIcon>
                <MarkerContent>
                  <span className="shimmer-text">
                    Распознаю автомобиль по VIN…
                  </span>
                </MarkerContent>
              </Marker>
            ) : null}
            {vinResolution && pendingRawVin ? (
              <VehicleResolutionCard
                resolution={vinResolution}
                candidate={vinResolution.candidates[0] ?? null}
                disabled={busy}
                onConfirm={(vehicle) => {
                  const provenance = {
                    resolvedAt: vinResolution.resolvedAt,
                    candidateId: vinResolution.candidates[0]?.id,
                  };
                  if (activeVehicle) {
                    updateActiveVehicle({
                      ...vehicle,
                      vin: pendingRawVin,
                      vinResolutionSource: "nhtsa-vpic",
                      vinResolutionProvenance: provenance,
                    });
                  } else {
                    saveVehicle({
                      ...vehicle,
                      displayName: `${vehicle.make} ${vehicle.model}`,
                      vin: pendingRawVin,
                      vinResolutionSource: "nhtsa-vpic",
                      vinResolutionProvenance: provenance,
                    });
                  }
                  clearPendingVin();
                  setPendingRawVin(null);
                  setVinResolution(null);
                  void submitText(
                    `Подтверждаю автомобиль: ${vehicle.make} ${vehicle.model}, ${vehicle.year}.`,
                  );
                }}
              />
            ) : null}
            {vinResolutionError ? (
              <p className="request-validation" role="alert">
                <AlertCircle size={15} />
                {vinResolutionError}
              </p>
            ) : null}
            {guestUsage && guestUsage.searchesUsed >= 2 ? (
              <>
                <div className="composer-notice">
                  <span>Поиск по реальным каталогам</span>
                  <GuestQuotaControl usage={guestUsage} />
                </div>
                {!limitPromptDismissed ? (
                  <div className="composer-login-prompt">
                    <div>
                      <strong>Сохраните этот диалог</strong>
                      <span>
                        Войдите, чтобы сохранить историю и продолжить без
                        гостевого лимита.
                      </span>
                    </div>
                    <div>
                      <Link
                        className="button secondary pressable"
                        href="/auth/sign-in"
                      >
                        Войти
                      </Link>
                      <button
                        className="composer-dismiss pressable"
                        type="button"
                        onClick={() => setLimitPromptDismissed(true)}
                      >
                        Не сейчас
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
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
          </div>
        </form>
      </MessageScrollerProvider>
    </section>
  );
}
