"use client";

import {
  Check,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

const vehicles = [
  {
    name: "Peugeot 308",
    details: "2008 · 1.6 VTi · хэтчбек · 3 двери",
    vin: "VF3••••••••4821",
    active: true,
    letter: "P",
  },
  {
    name: "Volkswagen Golf VII",
    details: "2015 · 1.4 TSI · хэтчбек",
    vin: "WVW••••••••9174",
    active: false,
    letter: "V",
  },
];

export function GarageView() {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="content-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Контекст для точного поиска</span>
          <h1>Мой гараж</h1>
          <p>
            Сохранённый автомобиль автоматически подставляется в новые запросы.
          </p>
        </div>
        <button
          className="button primary pressable"
          type="button"
          onClick={() => setShowForm((value) => !value)}
        >
          <Plus size={18} />
          Добавить автомобиль
        </button>
      </header>

      {showForm ? (
        <form
          className="add-vehicle-card"
          onSubmit={(event) => event.preventDefault()}
        >
          <div>
            <span>Новый автомобиль</span>
            <h2>Добавить по VIN</h2>
            <p>
              Мы попробуем определить базовые параметры. Перед сохранением вы
              сможете всё проверить.
            </p>
          </div>
          <label>
            VIN
            <input placeholder="Введите 17 символов" maxLength={17} />
          </label>
          <div className="request-actions">
            <button
              className="button secondary pressable"
              type="button"
              onClick={() => setShowForm(false)}
            >
              Отмена
            </button>
            <button className="button primary pressable" type="submit">
              Продолжить
              <ChevronRight size={17} />
            </button>
          </div>
        </form>
      ) : null}

      <div className="vehicle-list">
        {vehicles.map((vehicle) => (
          <article
            className={`vehicle-card ${vehicle.active ? "vehicle-active" : ""}`}
            key={vehicle.name}
          >
            <div className="vehicle-letter">{vehicle.letter}</div>
            <div className="vehicle-copy">
              <div className="vehicle-title-row">
                <h2>{vehicle.name}</h2>
                {vehicle.active ? (
                  <span className="active-badge">
                    <Check size={14} /> Активный
                  </span>
                ) : null}
              </div>
              <p>{vehicle.details}</p>
              <span className="vin font-tabular">{vehicle.vin}</span>
            </div>
            <button
              className="icon-button pressable"
              type="button"
              aria-label={`Действия с ${vehicle.name}`}
            >
              <MoreHorizontal size={20} />
            </button>
          </article>
        ))}
      </div>

      <aside className="garage-note">
        <ShieldCheck size={21} />
        <div>
          <strong>VIN хранится как чувствительная информация</strong>
          <p>
            Полный номер не показывается в списках и не попадает в клиентские
            логи.
          </p>
        </div>
      </aside>
    </section>
  );
}
