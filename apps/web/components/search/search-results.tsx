"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Filter,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type FilterValue = "all" | "original" | "analog" | "used";

const offers = [
  {
    id: "1",
    type: "used" as const,
    badge: "Оригинал б/у",
    brand: "Peugeot",
    title: "Механизм стеклоподъёмника передний левый",
    number: "9680187780",
    price: 125,
    availability: "В наличии",
    delivery: "Самовывоз сегодня",
    location: "Минск",
    seller: "Mock · Авторазбор",
    recommended: true,
  },
  {
    id: "2",
    type: "analog" as const,
    badge: "Новый аналог",
    brand: "BLIC",
    title: "Стеклоподъёмник электрический передний левый",
    number: "6060-00-PE4441",
    price: 164,
    availability: "Под заказ",
    delivery: "2–4 рабочих дня",
    location: "Минск",
    seller: "Mock · Поставщик",
    recommended: false,
  },
  {
    id: "3",
    type: "original" as const,
    badge: "Новый оригинал",
    brand: "Peugeot",
    title: "Стеклоподъёмник двери передний левый",
    number: "9221.GW",
    price: 287,
    availability: "Осталось 2",
    delivery: "Доставка завтра",
    location: "Гомель",
    seller: "Mock · Официальный склад",
    recommended: false,
  },
  {
    id: "4",
    type: "unknown" as const,
    badge: "Не определено",
    brand: "Без бренда",
    title: "Механизм стекла Peugeot 308 левый",
    number: "Не указан",
    price: 139,
    availability: "Уточнить",
    delivery: "Уточнить у продавца",
    location: "Брест",
    seller: "Mock · Частное объявление",
    recommended: false,
  },
];

const filters: { label: string; value: FilterValue }[] = [
  { label: "Все", value: "all" },
  { label: "Новый оригинал", value: "original" },
  { label: "Новый аналог", value: "analog" },
  { label: "Б/у", value: "used" },
];

export function SearchResults({ searchId }: Readonly<{ searchId: string }>) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortAscending, setSortAscending] = useState(true);

  const visibleOffers = useMemo(() => {
    const filtered =
      filter === "all"
        ? offers
        : offers.filter((offer) => offer.type === filter);
    return [...filtered].sort((first, second) =>
      sortAscending ? first.price - second.price : second.price - first.price,
    );
  }, [filter, sortAscending]);

  return (
    <section className="results-page">
      <header className="results-header">
        <div className="results-title-row">
          <Link
            className="icon-button pressable"
            href="/chat"
            aria-label="Вернуться в чат"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <span className="eyebrow">
              Поиск {searchId === "demo" ? "· демо" : ""}
            </span>
            <h1>Передний левый стеклоподъёмник</h1>
            <p>Peugeot 308 · 2008 · хэтчбек · 3 двери</p>
          </div>
          <button
            className="button secondary pressable refresh-button"
            type="button"
          >
            <RefreshCw size={17} />
            Обновить
          </button>
        </div>

        <div className="result-stats">
          <span>
            <Check size={16} /> Поиск завершён
          </span>
          <span>18 предложений</span>
          <span>
            <Clock3 size={15} /> обновлено сейчас
          </span>
          <span className="demo-badge">Демо-данные</span>
        </div>
      </header>

      <div className="filters-bar">
        <div
          className="filter-tabs"
          role="tablist"
          aria-label="Тип предложения"
        >
          {filters.map((item) => (
            <button
              className={`filter-tab pressable ${
                filter === item.value ? "selected" : ""
              }`}
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filter-actions">
          <button className="button outline pressable" type="button">
            <Filter size={17} />
            Фильтры
          </button>
          <button
            className="button outline pressable"
            type="button"
            onClick={() => setSortAscending((value) => !value)}
          >
            <SlidersHorizontal size={17} />
            Цена {sortAscending ? "сначала ниже" : "сначала выше"}
            <ChevronDown size={15} />
          </button>
        </div>
      </div>

      <div className="compatibility-warning">
        <TriangleAlert size={20} />
        <p>
          <strong>Проверьте совместимость перед покупкой.</strong> Демо-выдача
          не подтверждена каталогом. Уточните деталь по VIN у продавца.
        </p>
      </div>

      <div className="offer-list">
        {visibleOffers.length ? (
          visibleOffers.map((offer) => (
            <article
              className={`offer-card ${offer.recommended ? "recommended" : ""}`}
              key={offer.id}
            >
              <div className="offer-main">
                <div className="offer-badges">
                  <span className={`offer-badge ${offer.type}`}>
                    {offer.badge}
                  </span>
                  {offer.recommended ? (
                    <span className="match-badge">
                      <Check size={13} /> Лучшее совпадение
                    </span>
                  ) : null}
                </div>
                <span className="offer-brand">{offer.brand}</span>
                <h2>{offer.title}</h2>
                <span className="part-number font-tabular">
                  Артикул: {offer.number}
                </span>
              </div>

              <div className="offer-logistics">
                <span className="availability">
                  <span className="status-dot" />
                  {offer.availability}
                </span>
                <span>{offer.delivery}</span>
                <span>
                  <MapPin size={15} /> {offer.location}
                </span>
                <small>{offer.seller}</small>
              </div>

              <div className="offer-action">
                <span className="price font-tabular">{offer.price} BYN</span>
                <small>Цена продавца</small>
                <a
                  className={`button ${offer.recommended ? "primary" : "outline"} pressable`}
                  href={`https://example.com/autoradar-demo/${offer.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  На сайт продавца
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </article>
          ))
        ) : (
          <div className="filter-empty">
            <Filter size={28} />
            <h2>В этой категории пока нет предложений</h2>
            <button
              className="button secondary pressable"
              type="button"
              onClick={() => setFilter("all")}
            >
              Показать все
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
