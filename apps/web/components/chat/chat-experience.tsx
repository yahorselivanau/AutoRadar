"use client";

import type {
  NormalizedOffer,
  PartConstraint,
  PartRequestExtraction,
  SearchClarification,
  VehicleContext,
} from "@autoradar/domain";
import { normalizeVin, VinSchema } from "@autoradar/domain";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  MapPin,
  Mic,
  Pencil,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { useGarage } from "@/lib/garage-store";

const suggestions = [
  {
    label: "Найти по артикулу",
    value: "Артикул: ",
  },
  {
    label: "Подобрать для машины",
    value: "Нужна запчасть для ",
  },
  {
    label: "Сохранить VIN",
    value: "Сохрани VIN ",
  },
  {
    label: "Описать деталь",
    value: "",
  },
];

type Extraction = PartRequestExtraction & {
  normalizedPartNumber: string | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Stage = "empty" | "loading" | "review" | "error";
type SearchStage = "idle" | "searching" | "clarification" | "results" | "error";

const sideLabels = {
  left: "Левая",
  right: "Правая",
  unknown: "Не указана",
} as const;

const positionLabels = {
  front: "Передняя",
  rear: "Задняя",
  unknown: "Не указано",
} as const;

const conditionLabels = {
  new: "Новая",
  used: "Б/у",
  any: "Любое",
} as const;

const sourceLabels: Record<NormalizedOffer["sourceId"], string> = {
  mock: "Mock",
  armtek: "ARMTEK",
  "av-parts": "AV-parts",
  motorland: "Motorland.by",
  remzona: "Remzona",
  zap: "Zap.by",
};

function toVehicleContext(
  vehicle: ReturnType<typeof useGarage>["activeVehicle"],
): VehicleContext | undefined {
  if (!vehicle) return undefined;
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    generation: vehicle.generation,
    body: vehicle.body,
    engine: vehicle.engine,
    transmission: vehicle.transmission,
    doors: vehicle.doors,
  };
}

function asVehicleContext(extraction: Extraction): VehicleContext | undefined {
  if (
    !extraction.vehicle.make ||
    !extraction.vehicle.model ||
    !extraction.vehicle.year
  ) {
    return undefined;
  }
  return {
    make: extraction.vehicle.make,
    model: extraction.vehicle.model,
    year: extraction.vehicle.year,
    generation: extraction.vehicle.generation ?? undefined,
    body: extraction.vehicle.body ?? undefined,
    engine: extraction.vehicle.engine ?? undefined,
    transmission: extraction.vehicle.transmission ?? undefined,
    doors: extraction.vehicle.doors ?? undefined,
  };
}

function formatOffersCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return `Нашёл ${count} реальных предложений.`;
  }
  if (mod10 === 1) return `Нашёл ${count} реальное предложение.`;
  if (mod10 >= 2 && mod10 <= 4) {
    return `Нашёл ${count} реальных предложения.`;
  }
  return `Нашёл ${count} реальных предложений.`;
}

function extractVin(value: string): string | null {
  const compact = normalizeVin(value);
  const direct = VinSchema.safeParse(compact);
  if (direct.success) return direct.data;
  const match = value.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  if (!match) return null;
  const parsed = VinSchema.safeParse(match[0]);
  return parsed.success ? parsed.data : null;
}

function messageId() {
  return crypto.randomUUID();
}

export function ChatExperience() {
  const {
    garage,
    activeVehicle,
    setActiveVehicle,
    updateActiveVehicle,
    setPendingVin,
  } = useGarage();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [stage, setStage] = useState<Stage>("empty");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [editing, setEditing] = useState(false);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [searchStage, setSearchStage] = useState<SearchStage>("idle");
  const [searchError, setSearchError] = useState("");
  const [offers, setOffers] = useState<NormalizedOffer[]>([]);
  const [clarification, setClarification] =
    useState<SearchClarification | null>(null);

  const vehicleLabel = useMemo(() => {
    if (!extraction) return "Не указан";
    return (
      [
        extraction.vehicle.make,
        extraction.vehicle.model,
        extraction.vehicle.year,
        extraction.vehicle.generation,
        extraction.vehicle.body,
        extraction.vehicle.engine,
        extraction.vehicle.doors ? `${extraction.vehicle.doors} дверей` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Не указан"
    );
  }, [extraction]);

  const addMessage = (role: Message["role"], text: string) => {
    setMessages((current) => [...current, { id: messageId(), role, text }]);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = query.trim();
    if (!normalized || stage === "loading") return;

    setQuery("");
    addMessage("user", normalized);
    setLastSearchQuery(normalized);
    setStage("loading");
    setSearchStage("idle");
    setClarification(null);
    setOffers([]);

    const vin = extractVin(normalized);
    if (vin) {
      if (activeVehicle) {
        updateActiveVehicle({ vin });
        addMessage(
          "assistant",
          `VIN сохранён для ${activeVehicle.displayName}. Полный номер в интерфейсе скрыт.`,
        );
      } else {
        setPendingVin(vin);
        addMessage(
          "assistant",
          "VIN распознан и подготовлен к сохранению. Укажите марку, модель и год в гараже, чтобы подтвердить автомобиль.",
        );
      }
      setStage(extraction ? "review" : "empty");
      return;
    }

    try {
      const response = await fetch("/api/ai/parse-part-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          currentExtraction: extraction ?? undefined,
          activeVehicle: toVehicleContext(activeVehicle),
        }),
      });
      const payload = (await response.json()) as {
        extraction?: Extraction;
        error?: string;
      };

      if (!response.ok || !payload.extraction) {
        throw new Error(payload.error ?? "Не удалось разобрать запрос.");
      }

      setExtraction(payload.extraction);
      addMessage("assistant", payload.extraction.summary);
      setStage("review");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось разобрать запрос.";
      addMessage("assistant", message);
      setStage("error");
    }
  };

  const applySuggestion = (value: string) => {
    setQuery(value);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const searchParts = async (currentExtraction = extraction) => {
    if (!currentExtraction?.partName) {
      setSearchError("Сначала укажите, какую деталь нужно найти.");
      setSearchStage("error");
      return;
    }

    setSearchStage("searching");
    setSearchError("");
    setOffers([]);
    setClarification(null);

    const searchRequest = {
      query:
        currentExtraction.rawPartNumber ??
        lastSearchQuery ??
        currentExtraction.partName,
      vehicle: asVehicleContext(currentExtraction),
      part: {
        name: currentExtraction.partName,
        side: currentExtraction.side,
        position: currentExtraction.position,
        condition: currentExtraction.condition,
        rawPartNumber: currentExtraction.rawPartNumber ?? undefined,
        normalizedPartNumber:
          currentExtraction.normalizedPartNumber ?? undefined,
        constraints: currentExtraction.constraints,
      },
    };

    try {
      const responses = await Promise.all(
        ["/api/search/zap", "/api/search/motorland"].map(async (endpoint) => {
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(searchRequest),
            });
            const payload = (await response.json()) as {
              offers?: NormalizedOffer[];
              clarification?: SearchClarification;
              error?: string;
            };
            return { ok: response.ok, payload };
          } catch {
            return {
              ok: false,
              payload: { error: "Один из источников не ответил." },
            };
          }
        }),
      );
      const successful = responses.filter(
        (result) => result.ok && result.payload.offers,
      );
      if (successful.length === 0) {
        throw new Error(
          responses
            .map((result) => result.payload.error)
            .filter(Boolean)
            .join(" ") || "Источники не ответили.",
        );
      }
      const requestedClarification = successful.find(
        (result) => result.payload.clarification,
      )?.payload.clarification;
      if (requestedClarification) {
        setClarification(requestedClarification);
        setSearchStage("clarification");
        return;
      }
      setOffers(successful.flatMap((result) => result.payload.offers ?? []));
      setSearchStage("results");
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Источник не ответил.",
      );
      setSearchStage("error");
    }
  };

  const applyClarification = (
    selected: SearchClarification["options"][number],
  ) => {
    if (!extraction || !clarification) return;
    let nextExtraction: Extraction;
    if (clarification.field === "part_attribute") {
      if (!clarification.attributeKey) return;
      const nextConstraint: PartConstraint = {
        key: clarification.attributeKey,
        value: String(selected.value),
      };
      nextExtraction = {
        ...extraction,
        constraints: [
          ...extraction.constraints.filter(
            (constraint) => constraint.key !== clarification.attributeKey,
          ),
          nextConstraint,
        ],
      };
    } else if (clarification.field === "doors") {
      nextExtraction = {
        ...extraction,
        vehicle: { ...extraction.vehicle, doors: Number(selected.value) },
      };
    } else {
      nextExtraction = {
        ...extraction,
        vehicle: {
          ...extraction.vehicle,
          [clarification.field]: String(selected.value),
        },
      };
    }
    setExtraction(nextExtraction);
    addMessage("assistant", `Изменено: ${selected.label}. Повторяю поиск.`);
    void searchParts(nextExtraction);
  };

  const updateExtractionField = (
    field: keyof Extraction["vehicle"] | "partName" | "rawPartNumber",
    value: string,
  ) => {
    if (!extraction) return;
    if (field === "partName" || field === "rawPartNumber") {
      setExtraction({
        ...extraction,
        [field]: value.trim() ? value : null,
        normalizedPartNumber:
          field === "rawPartNumber" && value.trim()
            ? value.toUpperCase().replace(/[\s./-]+/g, "")
            : extraction.normalizedPartNumber,
      });
      return;
    }
    setExtraction({
      ...extraction,
      vehicle: {
        ...extraction.vehicle,
        [field]:
          field === "year" || field === "doors"
            ? value
              ? Number(value)
              : null
            : value || null,
      },
    });
  };

  const saveManualChanges = () => {
    setEditing(false);
    addMessage("assistant", "Изменения применены к текущему запросу.");
    setSearchStage("idle");
  };

  return (
    <section className="chat-page">
      <div className="desktop-context">
        <div className="vehicle-switcher">
          <button
            className="vehicle-context pressable"
            type="button"
            aria-expanded={vehicleMenuOpen}
            onClick={() => setVehicleMenuOpen((open) => !open)}
          >
            <span className="vehicle-mark">{activeVehicle ? "✓" : "+"}</span>
            <span>
              <strong>
                {activeVehicle
                  ? `${activeVehicle.make} ${activeVehicle.model} ${activeVehicle.year}`
                  : "Автомобиль не выбран"}
              </strong>
              <small>
                {activeVehicle
                  ? "Используется в новых запросах"
                  : "Поиск работает и без гаража"}
              </small>
            </span>
            <ChevronDown size={17} />
          </button>
          {vehicleMenuOpen ? (
            <div className="vehicle-menu">
              {garage.vehicles.length === 0 ? (
                <p>В гараже пока нет автомобилей.</p>
              ) : (
                garage.vehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => {
                      setActiveVehicle(vehicle.id);
                      setVehicleMenuOpen(false);
                    }}
                  >
                    <span>
                      <strong>{vehicle.displayName}</strong>
                      <small>
                        {vehicle.make} {vehicle.model} · {vehicle.year}
                      </small>
                    </span>
                    {vehicle.id === activeVehicle?.id ? (
                      <Check size={17} />
                    ) : null}
                  </button>
                ))
              )}
              <Link href="/garage">Открыть и настроить гараж</Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-scroll">
        {messages.length === 0 && stage === "empty" ? (
          <div className="empty-chat">
            <div className="empty-copy enter-item">
              <span className="eyebrow">
                <Sparkles size={15} />
                AI-подбор автозапчастей
              </span>
              <h1>Что нужно найти?</h1>
              <p>
                Напишите запрос своими словами. Можно указать автомобиль,
                артикул, сторону, положение или попросить сохранить VIN.
              </p>
            </div>

            <div className="suggestion-grid enter-item">
              {suggestions.map((suggestion) => (
                <button
                  className="suggestion pressable"
                  key={suggestion.label}
                  type="button"
                  onClick={() => applySuggestion(suggestion.value)}
                >
                  <CircleDot size={16} />
                  <span>{suggestion.label}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>

            <div className="privacy-note enter-item">
              Никаких предзаполненных машин или деталей. Поиск доступен без
              регистрации.
            </div>
          </div>
        ) : (
          <div className="conversation">
            {messages.map((message) =>
              message.role === "user" ? (
                <div className="user-message" key={message.id}>
                  {message.text}
                </div>
              ) : (
                <div className="assistant-block" key={message.id}>
                  <span className="assistant-kicker">
                    <Sparkles size={15} /> AutoRadar
                  </span>
                  <p>{message.text}</p>
                  {message.text.includes("подготовлен к сохранению") ? (
                    <Link className="inline-link" href="/garage">
                      Открыть гараж <ChevronRight size={15} />
                    </Link>
                  ) : null}
                </div>
              ),
            )}

            {stage === "loading" ? (
              <div className="assistant-block" aria-live="polite">
                <span className="assistant-kicker">
                  <Sparkles size={15} /> AutoRadar
                </span>
                <p>Понимаю запрос и обновляю параметры…</p>
              </div>
            ) : null}

            {stage === "review" && extraction ? (
              <article className="request-card">
                <div className="card-heading">
                  <div>
                    <span>Текущий запрос</span>
                    <h2>{extraction.partName ?? "Деталь нужно уточнить"}</h2>
                  </div>
                  <span className="confidence-badge">
                    <Check size={14} /> Можно изменить
                  </span>
                </div>

                {editing ? (
                  <div className="request-edit-grid">
                    <label>
                      <span>Деталь</span>
                      <input
                        value={extraction.partName ?? ""}
                        onChange={(event) =>
                          updateExtractionField("partName", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Артикул / OEM</span>
                      <input
                        value={extraction.rawPartNumber ?? ""}
                        onChange={(event) =>
                          updateExtractionField(
                            "rawPartNumber",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>Марка</span>
                      <input
                        value={extraction.vehicle.make ?? ""}
                        onChange={(event) =>
                          updateExtractionField("make", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Модель</span>
                      <input
                        value={extraction.vehicle.model ?? ""}
                        onChange={(event) =>
                          updateExtractionField("model", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Год</span>
                      <input
                        inputMode="numeric"
                        value={extraction.vehicle.year ?? ""}
                        onChange={(event) =>
                          updateExtractionField("year", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Версия / поколение</span>
                      <input
                        value={extraction.vehicle.generation ?? ""}
                        onChange={(event) =>
                          updateExtractionField(
                            "generation",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>Кузов</span>
                      <input
                        value={extraction.vehicle.body ?? ""}
                        onChange={(event) =>
                          updateExtractionField("body", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Двигатель</span>
                      <input
                        value={extraction.vehicle.engine ?? ""}
                        onChange={(event) =>
                          updateExtractionField("engine", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Дверей</span>
                      <input
                        inputMode="numeric"
                        value={extraction.vehicle.doors ?? ""}
                        onChange={(event) =>
                          updateExtractionField("doors", event.target.value)
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <dl className="request-grid">
                    <div>
                      <dt>Автомобиль</dt>
                      <dd>{vehicleLabel}</dd>
                    </div>
                    <div>
                      <dt>Артикул / OEM</dt>
                      <dd>{extraction.rawPartNumber ?? "Не указан"}</dd>
                    </div>
                    <div>
                      <dt>Положение и сторона</dt>
                      <dd>
                        {positionLabels[extraction.position]} ·{" "}
                        {sideLabels[extraction.side]}
                      </dd>
                    </div>
                    <div>
                      <dt>Состояние</dt>
                      <dd>{conditionLabels[extraction.condition]}</dd>
                    </div>
                    <div>
                      <dt>Дополнительные параметры</dt>
                      <dd>
                        {extraction.constraints.length > 0
                          ? extraction.constraints
                              .map(
                                (constraint) =>
                                  `${constraint.key}: ${constraint.value}`,
                              )
                              .join(" · ")
                          : "Не указаны"}
                      </dd>
                    </div>
                  </dl>
                )}

                <p className="request-note">
                  Напишите следующее изменение прямо в чат — например, «поставь
                  2010 год и 5 дверей» — или исправьте поля вручную.
                </p>
                <div className="request-actions">
                  {editing ? (
                    <>
                      <button
                        className="button secondary pressable"
                        type="button"
                        onClick={() => setEditing(false)}
                      >
                        <X size={17} />
                        Закрыть
                      </button>
                      <button
                        className="button primary pressable"
                        type="button"
                        onClick={saveManualChanges}
                      >
                        <Check size={17} />
                        Применить
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button secondary pressable"
                        type="button"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil size={17} />
                        Изменить
                      </button>
                      <button
                        className="button primary pressable"
                        type="button"
                        disabled={searchStage === "searching"}
                        onClick={() => void searchParts()}
                      >
                        <Search size={17} />
                        {searchStage === "searching" ? "Ищу…" : "Искать"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ) : null}

            {searchStage === "searching" ? (
              <article className="progress-card" aria-live="polite">
                <div className="progress-heading">
                  <div>
                    <span>Реальный поиск</span>
                    <strong>Запрашиваю Zap.by и Motorland.by</strong>
                  </div>
                  <CircleDot className="searching-icon" size={22} />
                </div>
                <div className="progress-track">
                  <span />
                </div>
                <p className="request-note">
                  Сопоставляю новые и б/у предложения, характеристики и
                  применимость. Это может занять несколько секунд.
                </p>
              </article>
            ) : null}

            {searchStage === "clarification" && clarification ? (
              <article className="clarification-card" aria-live="polite">
                <span className="assistant-kicker">
                  <Sparkles size={15} /> Нужно уточнить
                </span>
                <h2>{clarification.question}</h2>
                <p>Ответ нужен, чтобы не смешивать разные исполнения детали.</p>
                <div className="clarification-options">
                  {clarification.options.map((option) => (
                    <button
                      className="clarification-option pressable"
                      key={option.id}
                      type="button"
                      onClick={() => applyClarification(option)}
                    >
                      <span>{option.label}</span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              </article>
            ) : null}

            {searchStage === "error" ? (
              <div className="compatibility-warning" aria-live="polite">
                <CircleDot size={20} />
                <p>
                  <strong>Поиск не выполнен.</strong> {searchError}
                </p>
              </div>
            ) : null}

            {searchStage === "results" ? (
              <>
                <div className="assistant-block" aria-live="polite">
                  <span className="assistant-kicker">
                    <Sparkles size={15} /> AutoRadar
                  </span>
                  <p>
                    {offers.length > 0
                      ? formatOffersCount(offers.length)
                      : "По этому запросу предложений не найдено."}
                  </p>
                </div>

                {offers.length > 0 ? (
                  <div className="offer-list">
                    {offers.map((offer) => (
                      <article
                        className="offer-card"
                        key={`${offer.sourceId}-${offer.externalId}`}
                      >
                        <div className="offer-main">
                          <div className="offer-badges">
                            <span
                              className={`offer-badge ${
                                offer.matchStatus === "confirmed"
                                  ? "confirmed"
                                  : "unknown"
                              }`}
                            >
                              {sourceLabels[offer.sourceId]}
                            </span>
                            <span className="offer-badge unknown">
                              {offer.matchStatus === "confirmed"
                                ? "Совпадение подтверждено"
                                : "Нужно проверить"}
                            </span>
                          </div>
                          <span className="offer-brand">
                            {offer.brand ?? "Бренд не указан"}
                          </span>
                          <h2>{offer.title}</h2>
                          <span className="part-number">
                            Артикул: {offer.rawPartNumber ?? "не указан"}
                          </span>
                        </div>
                        <div className="offer-logistics">
                          <span>
                            <MapPin size={15} />
                            {offer.availability ??
                              offer.location ??
                              "Наличие не указано"}
                          </span>
                          {offer.deliveryText ? (
                            <span>Доставка: {offer.deliveryText}</span>
                          ) : null}
                          {offer.matchReasons?.map((reason) => (
                            <small key={reason}>✓ {reason}</small>
                          ))}
                        </div>
                        <div className="offer-action">
                          <span className="price font-tabular">
                            {offer.priceAmount
                              ? `${offer.priceAmount} BYN`
                              : "Цена на сайте"}
                          </span>
                          <small>Проверьте цену и наличие у продавца.</small>
                          <a
                            className="button secondary pressable"
                            href={offer.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            На {sourceLabels[offer.sourceId]}{" "}
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {stage === "error" ? (
              <div className="request-actions">
                <button
                  className="button primary pressable"
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                >
                  Изменить текст запроса
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="composer-wrap safe-bottom">
        <form className="composer" onSubmit={(event) => void submit(event)}>
          <label className="sr-only" htmlFor="parts-query">
            Что нужно найти?
          </label>
          <textarea
            ref={inputRef}
            id="parts-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              extraction
                ? "Уточните или измените текущий запрос…"
                : "Опишите деталь, автомобиль или введите VIN…"
            }
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            disabled={stage === "loading"}
          />
          <div className="composer-tools">
            <button
              className="composer-icon pressable"
              type="button"
              aria-label="Голосовой ввод (скоро)"
              title="Голосовой ввод появится позже"
            >
              <Mic size={19} />
            </button>
            <button
              className="submit-button pressable"
              type="submit"
              disabled={!query.trim() || stage === "loading"}
              aria-label="Отправить запрос"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
        <p className="composer-caption">
          AutoRadar не подтверждает совместимость без данных источника.
        </p>
      </div>
    </section>
  );
}
