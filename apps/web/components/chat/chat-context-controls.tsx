"use client";

import type { GuestUsage } from "@autoradar/domain";
import {
  CarFront,
  Check,
  ChevronDown,
  Gauge,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useGarage } from "@/lib/garage-store";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/popover";

export function VehicleSwitcher() {
  const { garage, activeVehicle, setActiveVehicle } = useGarage();
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label="Выбрать автомобиль для поиска"
        className="composer-context-trigger vehicle-switcher-trigger pressable"
      >
        <span className="vehicle-switcher-icon">
          <CarFront size={18} />
        </span>
        <span>
          {activeVehicle
            ? `${activeVehicle.displayName} · ${activeVehicle.year}`
            : "Выбрать автомобиль"}
        </span>
        <ChevronDown size={14} />
      </PopoverTrigger>
      <PopoverContent className="vehicle-switcher-popover" side="bottom">
        <div className="popover-heading">
          <div>
            <PopoverTitle>Автомобиль</PopoverTitle>
            <PopoverDescription>
              Используется для следующего запроса.
            </PopoverDescription>
          </div>
        </div>
        {garage.vehicles.length > 0 ? (
          <div className="vehicle-switcher-list">
            {garage.vehicles.map((vehicle) => {
              const selected = vehicle.id === activeVehicle?.id;
              return (
                <button
                  className="vehicle-switcher-option pressable"
                  data-selected={selected}
                  key={vehicle.id}
                  type="button"
                  onClick={() => {
                    setActiveVehicle(vehicle.id);
                    setOpen(false);
                  }}
                >
                  <span className="vehicle-switcher-mark">
                    <CarFront
                      fill="currentColor"
                      fillOpacity={0.12}
                      size={18}
                    />
                  </span>
                  <span>
                    <strong>{vehicle.displayName}</strong>
                    <small>
                      {vehicle.make} {vehicle.model} · {vehicle.year}
                    </small>
                  </span>
                  {selected ? <Check size={17} /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="vehicle-switcher-empty">
            <CarFront size={21} />
            <p>В гараже пока нет автомобилей.</p>
          </div>
        )}
        <Link className="popover-footer-action pressable" href="/garage">
          <Plus size={16} />
          {garage.vehicles.length > 0
            ? "Открыть гараж"
            : "Добавить автомобиль"}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

export function GuestQuotaControl({ usage }: { usage: GuestUsage | null }) {
  const [open, setOpen] = useState(false);
  if (!usage) return null;

  const searchesLeft = Math.max(usage.searchesLimit - usage.searchesUsed, 0);
  if (usage.searchesUsed < 2 && searchesLeft > 2) return null;
  const state =
    searchesLeft === 0 ? "empty" : searchesLeft <= 2 ? "low" : "default";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={`Осталось реальных поисков: ${searchesLeft}`}
        className="composer-context-trigger quota-trigger pressable"
        data-state={state}
      >
        <Gauge size={15} />
        <span className="font-tabular">{searchesLeft}</span>
        <span className="quota-label">поиска осталось</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="quota-popover">
        <div className="quota-popover-value font-tabular">
          <strong>{searchesLeft}</strong>
          <span>из {usage.searchesLimit} реальных поисков осталось</span>
        </div>
        <p>
          Обычные вопросы в чате бесплатны. Лимит расходуется только при
          запуске федеративного поиска по каталогам.
        </p>
        <Link className="popover-footer-action pressable" href="/auth/sign-in">
          <UserRound size={16} />
          Войти без ограничений
        </Link>
      </PopoverContent>
    </Popover>
  );
}
