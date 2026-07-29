"use client";

import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  MapPin,
  Mic,
  Pencil,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  NormalizedOffer,
  PartConstraint,
  PartRequestExtraction,
  SavedSearchContext,
  SearchClarification,
  VehicleContext,
} from "@autoradar/domain";
import { SavedSearchContextSchema } from "@autoradar/domain";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

const suggestions = [
  "Передний левый стеклоподъёмник на Peugeot 308 2008",
  "Найти по номеру детали",
  "Подобрать для моей машины",
  "Добавить автомобиль по VIN",
];

type Extraction = PartRequestExtraction & {
  normalizedPartNumber: string | null;
};

type Stage = "empty" | "loading" | "review" | "error";
type SearchStage = "idle" | "searching" | "clarification" | "results" | "error";

const savedContextKey = "autoradar.search-context.v1";
const savedContextEvent = "autoradar:saved-context";
const emptySavedContext: SavedSearchContext = { partPreferences: {} };

function subscribeSavedContext(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(savedContextEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(savedContextEvent, onStoreChange);
  };
}

function readSavedContext(): string | null {
  try {
    return window.localStorage.getItem(savedContextKey);
  } catch {
    return null;
  }
}

function parseSavedContext(value: string | null): SavedSearchContext {
  if (!value) return emptySavedContext;
  try {
    const parsed = SavedSearchContextSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : emptySavedContext;
  } catch {
    return emptySavedContext;
  }
}

function vehicleKey(vehicle: VehicleContext): string {
  return `${vehicle.make}:${vehicle.model}:${vehicle.year}`.toLocaleLowerCase(
    "ru",
  );
}

function preferenceKey(vehicle: VehicleContext, partName: string): string {
  return `${vehicleKey(vehicle)}:${partName
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "")}`;
}

function asSavedVehicle(extraction: Extraction): VehicleContext | undefined {
  const { vehicle } = extraction;
  if (!vehicle.make || !vehicle.model || !vehicle.year) return undefined;
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    generation: vehicle.generation ?? undefined,
    body: vehicle.body ?? undefined,
    engine: vehicle.engine ?? undefined,
    transmission: vehicle.transmission ?? undefined,
    doors: vehicle.doors ?? undefined,
  };
}

function mergeSavedContext(
  extraction: Extraction,
  saved: SavedSearchContext,
): Extraction {
  const extractedVehicle = asSavedVehicle(extraction);
  const active = saved.activeVehicle;
  const canUseActive =
    active &&
    (!extraction.vehicle.make ||
      (extractedVehicle &&
        vehicleKey(extractedVehicle) === vehicleKey(active)));
  const vehicle = canUseActive
    ? {
        make: extraction.vehicle.make ?? active.make,
        model: extraction.vehicle.model ?? active.model,
        year: extraction.vehicle.year ?? active.year,
        generation: extraction.vehicle.generation ?? active.generation ?? null,
        body: extraction.vehicle.body ?? active.body ?? null,
        engine: extraction.vehicle.engine ?? active.engine ?? null,
        transmission:
          extraction.vehicle.transmission ?? active.transmission ?? null,
        doors: extraction.vehicle.doors ?? active.doors ?? null,
      }
    : extraction.vehicle;
  const merged = { ...extraction, vehicle };
  const resolvedVehicle = asSavedVehicle(merged);
  const preferences =
    resolvedVehicle && merged.partName
      ? (saved.partPreferences[
          preferenceKey(resolvedVehicle, merged.partName)
        ] ?? [])
      : [];
  return {
    ...merged,
    constraints: [
      ...merged.constraints,
      ...preferences.filter(
        (savedValue) =>
          !merged.constraints.some(
            (constraint) => constraint.key === savedValue.key,
          ),
      ),
    ],
  };
}

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
  remzona: "Remzona",
  zap: "Zap.by",
};

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

export function ChatExperience() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [stage, setStage] = useState<Stage>("empty");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchStage, setSearchStage] = useState<SearchStage>("idle");
  const [searchError, setSearchError] = useState("");
  const [offers, setOffers] = useState<NormalizedOffer[]>([]);
  const [clarification, setClarification] =
    useState<SearchClarification | null>(null);
  const savedContextValue = useSyncExternalStore(
    subscribeSavedContext,
    readSavedContext,
    () => null,
  );
  const savedContext = useMemo(
    () => parseSavedContext(savedContextValue),
    [savedContextValue],
  );

  const persistContext = (next: SavedSearchContext) => {
    try {
      window.localStorage.setItem(savedContextKey, JSON.stringify(next));
      window.dispatchEvent(new Event(savedContextEvent));
    } catch {
      // Private browsing/storage limits must not block search.
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;

    setSubmittedQuery(normalized);
    setStage("loading");
    setErrorMessage("");
    setSearchStage("idle");
    setClarification(null);
    setOffers([]);

    try {
      const response = await fetch("/api/ai/parse-part-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: normalized }),
      });
      const payload = (await response.json()) as {
        extraction?: Extraction;
        error?: string;
      };

      if (!response.ok || !payload.extraction) {
        throw new Error(payload.error ?? "Не удалось разобрать запрос.");
      }

      const merged = mergeSavedContext(payload.extraction, savedContext);
      setExtraction(merged);
      const vehicle = asSavedVehicle(merged);
      if (vehicle) {
        persistContext({ ...savedContext, activeVehicle: vehicle });
      }
      setStage("review");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось разобрать запрос.",
      );
      setStage("error");
    }
  };

  const applySuggestion = (suggestion: string) => {
    setQuery(suggestion);
  };

  const searchParts = async (currentExtraction = extraction) => {
    if (!currentExtraction) return;

    setSearchStage("searching");
    setSearchError("");
    setOffers([]);
    setClarification(null);

    const hasVehicle =
      currentExtraction.vehicle.make &&
      currentExtraction.vehicle.model &&
      currentExtraction.vehicle.year;

    const searchRequest = {
      query: submittedQuery,
      vehicle: hasVehicle
        ? {
            make: currentExtraction.vehicle.make,
            model: currentExtraction.vehicle.model,
            year: currentExtraction.vehicle.year,
            generation: currentExtraction.vehicle.generation ?? undefined,
            body: currentExtraction.vehicle.body ?? undefined,
            engine: currentExtraction.vehicle.engine ?? undefined,
            transmission: currentExtraction.vehicle.transmission ?? undefined,
            doors: currentExtraction.vehicle.doors ?? undefined,
          }
        : undefined,
      part: {
        name: currentExtraction.partName ?? "Неизвестная деталь",
        side: currentExtraction.side,
        position: currentExtraction.position,
        condition: currentExtraction.condition,
        rawPartNumber: currentExtraction.rawPartNumber ?? undefined,
        normalizedPartNumber:
          currentExtraction.normalizedPartNumber ?? undefined,
        constraints: currentExtraction.constraints,
      },
    };
    const sources = [{ name: "Zap.by", endpoint: "/api/search/zap" }];

    try {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const response = await fetch(source.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(searchRequest),
            });
            const payload = (await response.json()) as {
              offers?: NormalizedOffer[];
              clarification?: SearchClarification;
              error?: string;
            };
            return response.ok && payload.offers
              ? {
                  offers: payload.offers,
                  clarification: payload.clarification,
                }
              : {
                  error: `${source.name}: ${payload.error ?? "источник не ответил"}`,
                };
          } catch {
            return { error: `${source.name}: источник не ответил` };
          }
        }),
      );
      const successfulResults = results.filter(
        (
          result,
        ): result is {
          offers: NormalizedOffer[];
          clarification?: SearchClarification;
        } => "offers" in result,
      );
      if (successfulResults.length === 0) {
        throw new Error(
          results
            .map((result) => ("error" in result ? result.error : undefined))
            .filter(Boolean)
            .join(" · ") || "Источники не ответили.",
        );
      }

      const nextClarification = successfulResults.find(
        (result) => result.clarification,
      )?.clarification;
      if (nextClarification) {
        setClarification(nextClarification);
        setSearchStage("clarification");
        return;
      }
      setOffers(successfulResults.flatMap((result) => result.offers));
      setSearchStage("results");
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Источники не ответили.",
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
        vehicle: {
          ...extraction.vehicle,
          doors: Number(selected.value),
        },
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
    const vehicle = asSavedVehicle(nextExtraction);
    if (vehicle) {
      const nextSaved: SavedSearchContext = {
        ...savedContext,
        activeVehicle: vehicle,
        partPreferences: { ...savedContext.partPreferences },
      };
      if (clarification.field === "part_attribute" && nextExtraction.partName) {
        nextSaved.partPreferences[
          preferenceKey(vehicle, nextExtraction.partName)
        ] = nextExtraction.constraints;
      }
      persistContext(nextSaved);
    }
    void searchParts(nextExtraction);
  };

  const vehicleLabel = extraction
    ? [
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
    : "Не указан";
  const activeVehicle = savedContext.activeVehicle;

  return (
    <section className="chat-page">
      <div className="desktop-context">
        <button className="vehicle-context pressable" type="button">
          <span className="vehicle-mark">{activeVehicle ? "✓" : "+"}</span>
          <span>
            <strong>
              {activeVehicle
                ? `${activeVehicle.make} ${activeVehicle.model} ${activeVehicle.year}`
                : "Автомобиль не выбран"}
            </strong>
            <small>
              {activeVehicle
                ? [
                    activeVehicle.generation,
                    activeVehicle.engine,
                    activeVehicle.doors
                      ? `${activeVehicle.doors} дверей`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Используется для следующих запросов"
                : "Добавить для точного поиска"}
            </small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="chat-scroll">
        {stage === "empty" ? (
          <div className="empty-chat">
            <div className="empty-copy enter-item">
              <span className="eyebrow">
                <Sparkles size={15} />
                AI-подбор автозапчастей
              </span>
              <h1>Что нужно найти?</h1>
              <p>
                Опишите деталь своими словами. AI выделит параметры запроса, не
                придумывая OEM и совместимость.
              </p>
            </div>

            <div className="suggestion-grid enter-item">
              {suggestions.map((suggestion, index) => (
                <button
                  className={`suggestion pressable ${index === 0 ? "wide" : ""}`}
                  key={suggestion}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                >
                  {index === 0 ? <Search size={17} /> : <CircleDot size={16} />}
                  <span>{suggestion}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>

            <div className="privacy-note enter-item">
              Поиск доступен без регистрации. Совместимость всегда нужно
              подтвердить у продавца.
            </div>
          </div>
        ) : (
          <div className="conversation">
            <div className="user-message">{submittedQuery}</div>
            <div className="assistant-block">
              <span className="assistant-kicker">
                <Sparkles size={15} /> AutoRadar
              </span>
              {stage === "loading" ? (
                <p aria-live="polite">AI разбирает параметры запроса…</p>
              ) : stage === "error" ? (
                <p aria-live="polite">{errorMessage}</p>
              ) : (
                <p>
                  {extraction?.summary}{" "}
                  {extraction?.clarificationQuestion ?? ""}
                </p>
              )}
            </div>

            {stage === "review" && extraction ? (
              <article className="request-card">
                <div className="card-heading">
                  <div>
                    <span>Распознано через Vercel AI Gateway</span>
                    <h2>{extraction.partName ?? "Деталь нужно уточнить"}</h2>
                  </div>
                  <span className="confidence-badge">
                    <Check size={14} /> Структурировано
                  </span>
                </div>
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
                <p className="request-note">
                  Zap.by проверяет поколение автомобиля, характеристики и
                  применимость карточек. Если данных недостаточно, AutoRadar
                  задаст один уточняющий вопрос и запомнит ответ.
                </p>
                <div className="request-actions">
                  <button
                    className="button secondary pressable"
                    type="button"
                    onClick={() => setStage("empty")}
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
                    {searchStage === "searching"
                      ? "Ищу на Zap.by…"
                      : "Искать на Zap.by"}
                  </button>
                </div>
              </article>
            ) : null}

            {searchStage === "clarification" && clarification ? (
              <article className="clarification-card" aria-live="polite">
                <span className="assistant-kicker">
                  <Sparkles size={15} /> Нужно уточнить
                </span>
                <h2>{clarification.question}</h2>
                <p>
                  Zap.by нашёл несколько совместимых вариантов. Ответ нужен,
                  чтобы не смешивать разные исполнения детали.
                </p>
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
                          {offer.matchStatus !== "confirmed" ? (
                            <small>
                              В карточке Zap.by не хватает данных для полного
                              подтверждения.
                            </small>
                          ) : null}
                        </div>
                        <div className="offer-action">
                          <span className="price">
                            {offer.priceAmount
                              ? `${offer.priceAmount} BYN`
                              : "Цена на сайте"}
                          </span>
                          <small>
                            Цена и наличие доступны на карточке товара.
                          </small>
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
                  className="button secondary pressable"
                  type="button"
                  onClick={() => setStage("empty")}
                >
                  <Pencil size={17} />
                  Изменить запрос
                </button>
                <button
                  className="button primary pressable"
                  type="button"
                  onClick={() => void submit()}
                >
                  <Sparkles size={17} />
                  Повторить
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
            id="parts-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например, передний левый стеклоподъёмник…"
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
