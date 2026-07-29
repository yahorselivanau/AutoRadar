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
          <strong>Совместимость нужно проверить.</strong> Авто Радар показывает
          реальные предложения источников, но не подтверждает применяемость без
          их данных.
        </p>
      </div>

      <div className="filter-empty">
        <Search size={28} />
        <h2>Новый поиск начинается в чате</h2>
        <p>
          Введите артикул или название детали, подтвердите распознанные
          параметры и запустите проверку Zap.by, Motorland.by и Auto1.by.
        </p>
        <Link className="button primary pressable" href="/chat">
          Вернуться к AI-запросу
        </Link>
      </div>
    </section>
  );
}
