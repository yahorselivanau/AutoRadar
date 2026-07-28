"use client";

import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleDot,
  Mic,
  Pencil,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

const suggestions = [
  "Передний левый стеклоподъёмник на Peugeot 308 2008",
  "Найти по номеру детали",
  "Подобрать для моей машины",
  "Добавить автомобиль по VIN",
];

type Stage = "empty" | "review" | "results";

export function ChatExperience() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [stage, setStage] = useState<Stage>("empty");

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    setSubmittedQuery(normalized);
    setStage("review");
  };

  const applySuggestion = (suggestion: string) => {
    setQuery(suggestion);
    if (suggestion.startsWith("Передний")) {
      setSubmittedQuery(suggestion);
      setStage("review");
    }
  };

  return (
    <section className="chat-page">
      <div className="desktop-context">
        <button className="vehicle-context pressable" type="button">
          <span className="vehicle-mark">P</span>
          <span>
            <strong>Peugeot 308</strong>
            <small>2008 · хэтчбек · 1.6</small>
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
                Опишите деталь своими словами. AutoRadar уточнит автомобиль и
                сравнит предложения белорусских продавцов.
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
              <p>
                Я понял запрос так. Проверьте параметры — особенно кузов и
                количество дверей — перед запуском поиска.
              </p>
            </div>

            <article className="request-card">
              <div className="card-heading">
                <div>
                  <span>Запрос подготовлен</span>
                  <h2>Передний левый стеклоподъёмник</h2>
                </div>
                <span className="confidence-badge">
                  <Check size={14} /> Понятно
                </span>
              </div>
              <dl className="request-grid">
                <div>
                  <dt>Автомобиль</dt>
                  <dd>Peugeot 308 · 2008</dd>
                </div>
                <div>
                  <dt>Кузов</dt>
                  <dd>Хэтчбек · 3 двери</dd>
                </div>
                <div>
                  <dt>Положение</dt>
                  <dd>Передний · левый</dd>
                </div>
                <div>
                  <dt>Состояние</dt>
                  <dd>Любое</dd>
                </div>
              </dl>
              <div className="request-actions">
                <button className="button secondary pressable" type="button">
                  <Pencil size={17} />
                  Изменить
                </button>
                <button
                  className="button primary pressable"
                  type="button"
                  onClick={() => setStage("results")}
                >
                  <Search size={17} />
                  Искать предложения
                </button>
              </div>
            </article>

            {stage === "results" ? (
              <>
                <article className="progress-card" aria-live="polite">
                  <div className="progress-heading">
                    <div>
                      <span>Демонстрационный поиск завершён</span>
                      <strong>4 источника · 18 предложений</strong>
                    </div>
                    <span className="done-icon">
                      <Check size={18} />
                    </span>
                  </div>
                  <div className="progress-track">
                    <span />
                  </div>
                  <div className="source-pills">
                    <span>Mock · 18</span>
                    <span className="muted">Bamper · не подключён</span>
                    <span className="muted">ARMTEK · не подключён</span>
                  </div>
                </article>

                <article className="summary-card">
                  <header>
                    <div>
                      <span>Найдено в mock-выдаче</span>
                      <h2>18 предложений от 125 BYN</h2>
                    </div>
                    <span className="demo-badge">Демо-данные</span>
                  </header>
                  <div className="summary-groups">
                    <div>
                      <span className="dot blue" />
                      <small>Новый оригинал</small>
                      <strong>от 287 BYN</strong>
                    </div>
                    <div>
                      <span className="dot violet" />
                      <small>Новый аналог</small>
                      <strong>от 164 BYN</strong>
                    </div>
                    <div>
                      <span className="dot yellow" />
                      <small>Оригинал б/у</small>
                      <strong>от 125 BYN</strong>
                    </div>
                  </div>
                  <Link
                    className="button primary full pressable"
                    href="/search/demo"
                  >
                    Открыть все предложения
                    <ChevronRight size={17} />
                  </Link>
                </article>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="composer-wrap safe-bottom">
        <form className="composer" onSubmit={submit}>
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
                submit();
              }
            }}
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
              disabled={!query.trim()}
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
