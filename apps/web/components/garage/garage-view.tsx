"use client";

import { maskVin, type SavedVehicle } from "@autoradar/domain";
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Trash2,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
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
  const editing = editorOpen || Boolean(pendingVin);

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
    <section className="content-page garage-page">
      <Link className="garage-back pressable" href="/chat">
        <ArrowLeft size={17} />
        Вернуться в чат
      </Link>
      <header className="page-header">
        <div>
          <h1>Гараж</h1>
          <p>
            Сохранённый автомобиль автоматически подставляется в новые запросы.
          </p>
        </div>
        {garage.vehicles.length > 0 && !editing ? (
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

      {editing ? (
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
      ) : garage.vehicles.length === 0 ? (
        <div className="garage-empty">
          <Warehouse size={28} />
          <h2>Ваш гараж пока пуст</h2>
          <p>
            Добавьте автомобиль один раз, чтобы не повторять марку, модель и
            год в каждом запросе.
          </p>
          <button
            className="button primary pressable"
            type="button"
            onClick={openNew}
          >
            <Plus size={17} />
            Добавить автомобиль
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
    </section>
  );
}
