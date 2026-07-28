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
import type { NormalizedOffer } from "@autoradar/domain";
import { useState } from "react";
import type { FormEvent } from "react";

const suggestions = [
  "Передний левый стеклоподъёмник на Peugeot 308 2008",
  "Найти по номеру детали",
  "Подобрать для моей машины",
  "Добавить автомобиль по VIN",
];

type Extraction = {
  summary: string;
  partName: string | null;
  rawPartNumber: string | null;
  normalizedPartNumber: string | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
    generation: string | null;
    body: string | null;
    engine: string | null;
    transmission: string | null;
  };
  side: "left" | "right" | "unknown";
  position: "front" | "rear" | "unknown";
  condition: "new" | "used" | "any";
  needsClarification: boolean;
  clarificationQuestion: string | null;
};

type Stage = "empty" | "loading" | "review" | "error";
type SearchStage = "idle" | "searching" | "results" | "error";

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

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;

    setSubmittedQuery(normalized);
    setStage("loading");
    setErrorMessage("");

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

      setExtraction(payload.extraction);
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

  const searchRemzona = async () => {
    if (!extraction) return;

    setSearchStage("searching");
    setSearchError("");
    setOffers([]);

    const hasVehicle =
      extraction.vehicle.make &&
      extraction.vehicle.model &&
      extraction.vehicle.year;

    try {
      const response = await fetch("/api/search/remzona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: submittedQuery,
          vehicle: hasVehicle
            ? {
                make: extraction.vehicle.make,
                model: extraction.vehicle.model,
                year: extraction.vehicle.year,
                generation: extraction.vehicle.generation ?? undefined,
                body: extraction.vehicle.body ?? undefined,
                engine: extraction.vehicle.engine ?? undefined,
                transmission: extraction.vehicle.transmission ?? undefined,
              }
            : undefined,
          part: {
            name: extraction.partName ?? "Неизвестная деталь",
            side: extraction.side,
            position: extraction.position,
            condition: extraction.condition,
            rawPartNumber: extraction.rawPartNumber ?? undefined,
            normalizedPartNumber: extraction.normalizedPartNumber ?? undefined,
          },
        }),
      });
      const payload = (await response.json()) as {
        offers?: NormalizedOffer[];
        error?: string;
      };
      if (!response.ok || !payload.offers) {
        throw new Error(payload.error ?? "Remzona не ответила.");
      }

      setOffers(payload.offers);
      setSearchStage("results");
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Remzona не ответила.",
      );
      setSearchStage("error");
    }
  };

  const vehicleLabel = extraction
    ? [
        extraction.vehicle.make,
        extraction.vehicle.model,
        extraction.vehicle.year,
      ]
        .filter(Boolean)
        .join(" · ") || "Не указан"
    : "Не указан";

  return (
    <section className="chat-page">
      <div className="desktop-context">
        <button className="vehicle-context pressable" type="button">
          <span className="vehicle-mark">+</span>
          <span>
            <strong>Автомобиль не выбран</strong>
            <small>Добавить для точного поиска</small>
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
                </dl>
                <p className="request-note">
                  Remzona ищет новые запчасти по артикулу или названию. Цена,
                  наличие и совместимость показываются только когда источник
                  вернул их явно.
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
                    onClick={() => void searchRemzona()}
                  >
                    <Search size={17} />
                    {searchStage === "searching"
                      ? "Ищу на Remzona…"
                      : "Искать на Remzona"}
                  </button>
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
                    <Sparkles size={15} /> Remzona
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
                            <span className="offer-badge unknown">Remzona</span>
                            <span className="offer-badge unknown">
                              Состояние не указано
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
                            {offer.location ?? "Город не указан"}
                          </span>
                          <small>
                            Совместимость нужно подтвердить у продавца.
                          </small>
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
                            На Remzona <ExternalLink size={16} />
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
