"use client";

import {
  GarageStateSchema,
  SavedVehicleSchema,
  type GarageState,
  type SavedVehicle,
  type VehicleContext,
} from "@autoradar/domain";
import { useMemo, useSyncExternalStore } from "react";

const GARAGE_STORAGE_KEY = "autoradar.garage.v1";
const GARAGE_EVENT = "autoradar:garage-change";
const EMPTY_GARAGE: GarageState = {
  vehicles: [],
  activeVehicleId: null,
};
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_GARAGE);

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(GARAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(GARAGE_EVENT, onStoreChange);
  };
}

function readSnapshot(): string {
  try {
    return window.localStorage.getItem(GARAGE_STORAGE_KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function parseSnapshot(snapshot: string): GarageState {
  try {
    const parsed = GarageStateSchema.safeParse(JSON.parse(snapshot));
    return parsed.success ? parsed.data : EMPTY_GARAGE;
  } catch {
    return EMPTY_GARAGE;
  }
}

function persistGarage(next: GarageState) {
  const parsed = GarageStateSchema.parse(next);
  window.localStorage.setItem(GARAGE_STORAGE_KEY, JSON.stringify(parsed));
  window.dispatchEvent(new Event(GARAGE_EVENT));
}

export type VehicleDraft = VehicleContext & {
  id?: string;
  displayName: string;
  vin?: string;
  notes?: string;
};

export function upsertVehicle(
  garage: GarageState,
  draft: VehicleDraft,
): GarageState {
  const now = new Date().toISOString();
  const existing = draft.id
    ? garage.vehicles.find((vehicle) => vehicle.id === draft.id)
    : undefined;
  const vehicle = SavedVehicleSchema.parse({
    ...draft,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  const vehicles = existing
    ? garage.vehicles.map((item) => (item.id === vehicle.id ? vehicle : item))
    : [...garage.vehicles, vehicle];

  return {
    ...garage,
    vehicles,
    activeVehicleId: garage.activeVehicleId ?? vehicle.id,
    pendingVin: undefined,
  };
}

export function useGarage() {
  const snapshot = useSyncExternalStore(
    subscribe,
    readSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const garage = useMemo(() => parseSnapshot(snapshot), [snapshot]);
  const activeVehicle =
    garage.vehicles.find((vehicle) => vehicle.id === garage.activeVehicleId) ??
    null;

  return {
    garage,
    activeVehicle,
    saveVehicle(draft: VehicleDraft) {
      persistGarage(upsertVehicle(garage, draft));
    },
    removeVehicle(id: string) {
      const vehicles = garage.vehicles.filter((vehicle) => vehicle.id !== id);
      persistGarage({
        ...garage,
        vehicles,
        activeVehicleId:
          garage.activeVehicleId === id
            ? (vehicles[0]?.id ?? null)
            : garage.activeVehicleId,
      });
    },
    setActiveVehicle(id: string) {
      if (!garage.vehicles.some((vehicle) => vehicle.id === id)) return;
      persistGarage({ ...garage, activeVehicleId: id });
    },
    setPendingVin(vin: string) {
      persistGarage({ ...garage, pendingVin: vin });
    },
    clearPendingVin() {
      persistGarage({ ...garage, pendingVin: undefined });
    },
    updateActiveVehicle(patch: Partial<SavedVehicle>) {
      if (!activeVehicle) return;
      persistGarage(
        upsertVehicle(garage, {
          ...activeVehicle,
          ...patch,
          id: activeVehicle.id,
        }),
      );
    },
  };
}
