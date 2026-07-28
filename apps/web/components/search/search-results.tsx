import { ArrowLeft, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";

export function SearchResults({ searchId }: Readonly<{ searchId: string }>) {
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
            <span className="eyebrow">Поиск · {searchId}</span>
            <h1>Предложения ещё не загружены</h1>
            <p>Фиктивная выдача отключена.</p>
          </div>
        </div>
      </header>

      <div className="compatibility-warning">
        <TriangleAlert size={20} />
        <p>
          <strong>Нужен проверенный источник.</strong> AutoRadar покажет здесь
          только реальные предложения, полученные работающими адаптерами.
        </p>
      </div>

      <div className="filter-empty">
        <Search size={28} />
        <h2>Первый реальный адаптер ещё не подключён</h2>
        <p>
          AI-разбор запроса уже работает. Следующий этап — discovery и
          fixture-first реализация Bamper.
        </p>
        <Link className="button primary pressable" href="/chat">
          Вернуться к AI-запросу
        </Link>
      </div>
    </section>
  );
}
