"use client";

import { maskVin, type SavedVehicle } from "@autoradar/domain";
import {
  Check,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Warehouse,
} from "lucide-react";
import { useState } from "react";

import { useGarage } from "@/lib/garage-store";

import { VehicleEditor } from "./vehicle-editor";

export function GarageView() {
  const {
    garage,
    activeVehicle,
    saveVehicle,
    removeVehicle,
    setActiveVehicle,
    clearPendingVin,
  } = useGarage();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<SavedVehicle | null>(
    null,
  );
  const pendingVin = garage.pendingVin;

  const openNew = () => {
    setEditingVehicle(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingVehicle(null);
    if (pendingVin) clearPendingVin();
  };

  return (
    <section className="content-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Контекст для точного поиска</span>
          <h1>Мой гараж</h1>
          <p>
            Сохранённый автомобиль доступен в чате и автоматически дополняет
            новые запросы.
          </p>
        </div>
        {garage.vehicles.length > 0 ? (
          <button
            className="button primary pressable"
            type="button"
            onClick={openNew}
          >
            <Plus size={18} />
            Добавить автомобиль
          </button>
        ) : null}
      </header>

      {editorOpen || pendingVin ? (
        <VehicleEditor
          key={editingVehicle?.id ?? pendingVin ?? "new"}
          initialVehicle={editingVehicle}
          initialVin={editingVehicle ? undefined : pendingVin}
          onCancel={closeEditor}
          onSave={(vehicle) => {
            saveVehicle(vehicle);
            closeEditor();
          }}
        />
      ) : null}

      {garage.vehicles.length === 0 ? (
        <div className="garage-empty">
          <Warehouse size={28} />
          <h2>Гараж пока пуст</h2>
          <p>
            Добавьте автомобиль вручную или отправьте VIN в чате. Фиктивные
            машины больше не подставляются.
          </p>
          <button
            className="button primary pressable"
            type="button"
            onClick={openNew}
          >
            <Plus size={17} />
            Добавить первый автомобиль
          </button>
        </div>
      ) : (
        <div className="vehicle-list">
          {garage.vehicles.map((vehicle) => {
            const isActive = vehicle.id === activeVehicle?.id;
            return (
              <article
                className={`vehicle-card ${isActive ? "vehicle-active" : ""}`}
                key={vehicle.id}
              >
                <div className="vehicle-letter">
                  {vehicle.make.slice(0, 1).toUpperCase()}
                </div>
                <div className="vehicle-copy">
                  <div className="vehicle-title-row">
                    <h2>{vehicle.displayName}</h2>
                    {isActive ? (
                      <span className="active-badge">
                        <Check size={14} /> Активный
                      </span>
                    ) : null}
                  </div>
                  <p>
                    {[
                      `${vehicle.make} ${vehicle.model}`,
                      vehicle.year,
                      vehicle.generation,
                      vehicle.engine,
                      vehicle.body,
                      vehicle.doors ? `${vehicle.doors} дверей` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {vehicle.vin ? (
                    <span className="vin font-tabular">
                      {maskVin(vehicle.vin)}
                    </span>
                  ) : (
                    <span className="vin">VIN не указан</span>
                  )}
                </div>
                <div className="vehicle-card-actions">
                  {!isActive ? (
                    <button
                      className="button secondary pressable"
                      type="button"
                      onClick={() => setActiveVehicle(vehicle.id)}
                    >
                      Сделать активным
                    </button>
                  ) : null}
                  <button
                    className="icon-button pressable"
                    type="button"
                    aria-label={`Редактировать ${vehicle.displayName}`}
                    onClick={() => {
                      setEditingVehicle(vehicle);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-button destructive-icon pressable"
                    type="button"
                    aria-label={`Удалить ${vehicle.displayName}`}
                    onClick={() => removeVehicle(vehicle.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <aside className="garage-note">
        <ShieldCheck size={21} />
        <div>
          <strong>VIN хранится только на этом устройстве</strong>
          <p>
            В гостевом режиме данные сохраняются в браузере. Полный VIN не
            показывается в списке и не отправляется AI-модели.
          </p>
        </div>
      </aside>
    </section>
  );
}
