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
        <CarFront size={16} />
        <span>
          {activeVehicle
            ? `${activeVehicle.displayName} · ${activeVehicle.year}`
            : "Без машины"}
        </span>
        <ChevronDown size={14} />
      </PopoverTrigger>
      <PopoverContent className="vehicle-switcher-popover">
        <div className="popover-heading">
          <div>
            <PopoverTitle>Автомобиль для поиска</PopoverTitle>
            <PopoverDescription>
              Контекст применяется к следующему сообщению.
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
                    {vehicle.make.slice(0, 1).toUpperCase()}
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
            <p>Добавьте машину, чтобы не повторять её параметры в запросах.</p>
          </div>
        )}
        <Link className="popover-footer-action pressable" href="/garage">
          <Plus size={16} />
          {garage.vehicles.length > 0
            ? "Управлять гаражом"
            : "Добавить автомобиль"}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

export function GuestQuotaControl({ usage }: { usage: GuestUsage | null }) {
  const [open, setOpen] = useState(false);
  if (!usage) return null;

  const requestsLeft = Math.max(usage.requestsLimit - usage.requestsUsed, 0);
  const searchesLeft = Math.max(usage.searchesLimit - usage.searchesUsed, 0);
  const state =
    requestsLeft === 0 ? "empty" : requestsLeft <= 2 ? "low" : "default";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={`Осталось AI-запросов: ${requestsLeft}`}
        className="composer-context-trigger quota-trigger pressable"
        data-state={state}
      >
        <Gauge size={15} />
        <span className="font-tabular">{requestsLeft}</span>
        <span className="quota-label">AI-запросов</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="quota-popover">
        <div className="quota-popover-value font-tabular">
          <strong>{requestsLeft}</strong>
          <span>из {usage.requestsLimit} AI-запросов осталось</span>
        </div>
        <p>
          Сообщение расходует один запрос в любом диалоге. Реальных поисков по
          каталогам осталось: {searchesLeft}.
        </p>
        <Link className="popover-footer-action pressable" href="/auth/sign-in">
          <UserRound size={16} />
          Войти без ограничений
        </Link>
      </PopoverContent>
    </Popover>
  );
}
