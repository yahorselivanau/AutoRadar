"use client";

import type {
  NormalizedOffer,
  SearchJobResult,
  SourceId,
} from "@autoradar/domain";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  PackageSearch,
  Search,
  TriangleAlert,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

const sourceLabels: Record<SourceId, string> = {
  mock: "Mock",
  armtek: "ARMTEK",
  auto1: "Auto1.by",
  "av-parts": "AV-parts",
  davinagaz: "Davinagaz.by",
  motorland: "Motorland.by",
  remzona: "Remzona",
  zap: "Zap.by",
};

type Filter = "all" | "original" | "analog" | "used";

function matchesFilter(offer: NormalizedOffer, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "used") return offer.condition === "used";
  return offer.condition === "new" && offer.partKind === filter;
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

function OfferCard({ offer }: { offer: NormalizedOffer }) {
  return (
    <article className="offer-card">
      {offer.imageUrl ? (
        <div className="offer-media">
          <Image
            className="media-outline"
            src={offer.imageUrl}
            alt=""
            width={176}
            height={132}
            unoptimized
          />
        </div>
      ) : (
        <div className="offer-media offer-media-empty">
          <PackageSearch aria-hidden="true" size={24} />
        </div>
      )}
      <div className="offer-main">
        <div className="offer-badges">
          <span className="offer-badge confirmed">
            {sourceLabels[offer.sourceId]}
          </span>
          {offer.condition === "used" ? (
            <span className="offer-badge used">Б/у</span>
          ) : null}
          {offer.partKind === "original" ? (
            <span className="offer-badge original">Оригинал</span>
          ) : offer.partKind === "analog" ? (
            <span className="offer-badge analog">Аналог</span>
          ) : null}
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
        <small>Цена и наличие могли измениться.</small>
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

export function SearchResults({
  searchId,
  result,
  backHref,
}: Readonly<{
  searchId: string;
  result: SearchJobResult | null;
  backHref: string;
}>) {
  const [filter, setFilter] = useState<Filter>("all");
  const offers = useMemo(
    () => result?.offers.filter((offer) => matchesFilter(offer, filter)) ?? [],
    [filter, result],
  );
  const failedSources =
    result?.sources.filter((source) =>
      ["failed", "timeout", "blocked"].includes(source.status),
    ).length ?? 0;

  return (
    <section className="results-page">
      <header className="results-header">
        <div className="results-title-row">
          <Link
            className="icon-button pressable"
            href={backHref}
            aria-label="Вернуться в чат"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <span className="eyebrow">Результаты поиска</span>
            <h1>
              {result
                ? `Найдено ${formatOfferCount(result.offers.length)}`
                : "Результаты недоступны"}
            </h1>
            <p>
              {result
                ? `${result.sources.length} источника · ${
                    failedSources > 0
                      ? `${failedSources} не ответили`
                      : "поиск завершён"
                  }`
                : `Поиск ${searchId} не найден или принадлежит другому диалогу.`}
            </p>
          </div>
        </div>
      </header>

      {result ? (
        <>
          <div className="filters-bar">
            <div
              className="filter-tabs scroll-fade-x"
              role="tablist"
              aria-label="Тип предложения"
            >
              {(
                [
                  ["all", "Все"],
                  ["original", "Новые оригиналы"],
                  ["analog", "Новые аналоги"],
                  ["used", "Б/у"],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={`filter-tab ${filter === value ? "selected" : ""}`}
                  key={value}
                  role="tab"
                  type="button"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="compatibility-warning">
            <TriangleAlert size={20} />
            <p>
              <strong>Проверьте совместимость перед заказом.</strong> Совпадение
              названия или артикула не всегда подтверждает применяемость к
              автомобилю.
            </p>
          </div>

          {offers.length > 0 ? (
            <div className="offer-list">
              {offers.map((offer) => (
                <OfferCard
                  key={`${offer.sourceId}-${offer.externalId}`}
                  offer={offer}
                />
              ))}
            </div>
          ) : (
            <div className="filter-empty">
              <Search size={28} />
              <h2>В этой группе предложений нет</h2>
              <button
                className="button secondary pressable"
                type="button"
                onClick={() => setFilter("all")}
              >
                Показать все
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="filter-empty">
          <Search size={28} />
          <h2>Вернитесь к диалогу</h2>
          <p>Откройте результаты из карточки завершённого поиска.</p>
          <Link className="button primary pressable" href={backHref}>
            Вернуться к AI-подбору
          </Link>
        </div>
      )}
    </section>
  );
}
