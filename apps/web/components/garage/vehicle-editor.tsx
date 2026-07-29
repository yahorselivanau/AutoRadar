"use client";

import { VinSchema, type SavedVehicle } from "@autoradar/domain";
import { Check, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import type { VehicleDraft } from "@/lib/garage-store";

type Props = {
  initialVehicle?: SavedVehicle | null;
  initialVin?: string;
  onCancel: () => void;
  onSave: (vehicle: VehicleDraft) => void;
};

const currentYear = new Date().getUTCFullYear() + 1;

export function VehicleEditor({
  initialVehicle,
  initialVin,
  onCancel,
  onSave,
}: Props) {
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    displayName: initialVehicle?.displayName ?? "",
    vin: initialVehicle?.vin ?? initialVin ?? "",
    make: initialVehicle?.make ?? "",
    model: initialVehicle?.model ?? "",
    year: initialVehicle ? String(initialVehicle.year) : "",
    generation: initialVehicle?.generation ?? "",
    body: initialVehicle?.body ?? "",
    engine: initialVehicle?.engine ?? "",
    transmission: initialVehicle?.transmission ?? "",
    doors: initialVehicle?.doors ? String(initialVehicle.doors) : "",
    notes: initialVehicle?.notes ?? "",
  });

  const setField = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const year = Number(values.year);
    const doors = values.doors ? Number(values.doors) : undefined;
    const vin = values.vin.trim()
      ? VinSchema.safeParse(values.vin)
      : { success: true as const, data: undefined };

    if (!values.make.trim() || !values.model.trim()) {
      setError("Укажите марку и модель.");
      return;
    }
    if (!Number.isInteger(year) || year < 1886 || year > currentYear) {
      setError("Проверьте год выпуска.");
      return;
    }
    if (!vin.success) {
      setError(vin.error.issues[0]?.message ?? "Проверьте VIN.");
      return;
    }
    if (doors && ![2, 3, 4, 5, 6].includes(doors)) {
      setError("Количество дверей должно быть от 2 до 6.");
      return;
    }

    onSave({
      id: initialVehicle?.id,
      displayName:
        values.displayName.trim() ||
        `${values.make.trim()} ${values.model.trim()}`,
      vin: vin.data,
      make: values.make.trim(),
      model: values.model.trim(),
      year,
      generation: values.generation.trim() || undefined,
      body: values.body.trim() || undefined,
      engine: values.engine.trim() || undefined,
      transmission: values.transmission.trim() || undefined,
      doors,
      notes: values.notes.trim() || undefined,
    });
  };

  return (
    <form className="vehicle-editor" onSubmit={submit}>
      <div className="vehicle-editor-heading">
        <div>
          <span className="eyebrow">
            {initialVehicle ? "Редактирование" : "Новый автомобиль"}
          </span>
          <h2>
            {initialVehicle ? initialVehicle.displayName : "Данные автомобиля"}
          </h2>
          <p>
            VIN необязателен. Данные декодера всегда нужно проверить перед
            сохранением.
          </p>
        </div>
        <button
          className="icon-button pressable"
          type="button"
          aria-label="Закрыть форму"
          onClick={onCancel}
        >
          <X size={20} />
        </button>
      </div>

      <div className="vehicle-form-grid">
        <label className="field field-wide">
          <span>Название в гараже</span>
          <input
            value={values.displayName}
            onChange={(event) => setField("displayName", event.target.value)}
            placeholder="Например, Мой Peugeot"
          />
        </label>
        <label className="field field-wide">
          <span>VIN</span>
          <input
            className="font-tabular"
            value={values.vin}
            onChange={(event) => setField("vin", event.target.value)}
            placeholder="17 символов"
            maxLength={17}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Марка *</span>
          <input
            value={values.make}
            onChange={(event) => setField("make", event.target.value)}
            placeholder="Peugeot"
          />
        </label>
        <label className="field">
          <span>Модель *</span>
          <input
            value={values.model}
            onChange={(event) => setField("model", event.target.value)}
            placeholder="308"
          />
        </label>
        <label className="field">
          <span>Год *</span>
          <input
            className="font-tabular"
            value={values.year}
            onChange={(event) => setField("year", event.target.value)}
            inputMode="numeric"
            placeholder="2008"
          />
        </label>
        <label className="field">
          <span>Поколение / версия</span>
          <input
            value={values.generation}
            onChange={(event) => setField("generation", event.target.value)}
            placeholder="T7, рестайлинг"
          />
        </label>
        <label className="field">
          <span>Кузов</span>
          <input
            value={values.body}
            onChange={(event) => setField("body", event.target.value)}
            placeholder="Хэтчбек"
          />
        </label>
        <label className="field">
          <span>Двигатель</span>
          <input
            value={values.engine}
            onChange={(event) => setField("engine", event.target.value)}
            placeholder="1.6 VTi"
          />
        </label>
        <label className="field">
          <span>Коробка</span>
          <input
            value={values.transmission}
            onChange={(event) => setField("transmission", event.target.value)}
            placeholder="Механика"
          />
        </label>
        <label className="field">
          <span>Дверей</span>
          <input
            value={values.doors}
            onChange={(event) => setField("doors", event.target.value)}
            inputMode="numeric"
            placeholder="5"
          />
        </label>
        <label className="field field-wide">
          <span>Заметки</span>
          <textarea
            value={values.notes}
            onChange={(event) => setField("notes", event.target.value)}
            placeholder="Комплектация или важные особенности"
            rows={3}
          />
        </label>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="request-actions">
        <button
          className="button secondary pressable"
          type="button"
          onClick={onCancel}
        >
          Отмена
        </button>
        <button className="button primary pressable" type="submit">
          <Check size={17} />
          Сохранить автомобиль
        </button>
      </div>
    </form>
  );
}
