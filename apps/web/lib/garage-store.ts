"use client";

import {
  GarageStateSchema,
  SavedVehicleSchema,
  type GarageState,
  type SavedVehicle,
  type VehicleContext,
} from "@autoradar/domain";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const GARAGE_STORAGE_KEY = "autoradar.garage.v1";
const GARAGE_EVENT = "autoradar:garage-change";
const EMPTY_GARAGE: GarageState = {
  vehicles: [],
  activeVehicleId: null,
};
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_GARAGE);
let cloudSyncStarted = false;

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

async function saveVehicleToCloud(vehicle: SavedVehicle) {
  await fetch("/api/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vehicle),
  });
}

async function syncCloudGarage(localGarage: GarageState) {
  const response = await fetch("/api/vehicles");
  if (!response.ok) return;
  const cloud = GarageStateSchema.safeParse(await response.json());
  if (!cloud.success) return;

  const merged = new Map<string, SavedVehicle>();
  for (const vehicle of [...cloud.data.vehicles, ...localGarage.vehicles]) {
    const current = merged.get(vehicle.id);
    if (!current || vehicle.updatedAt >= current.updatedAt) {
      merged.set(vehicle.id, vehicle);
    }
  }
  const next: GarageState = {
    vehicles: [...merged.values()],
    activeVehicleId:
      localGarage.activeVehicleId ??
      cloud.data.activeVehicleId ??
      merged.values().next().value?.id ??
      null,
    pendingVin: localGarage.pendingVin,
  };
  persistGarage(next);

  await Promise.allSettled(
    next.vehicles.map((vehicle) => saveVehicleToCloud(vehicle)),
  );
  if (next.activeVehicleId) {
    await fetch("/api/vehicles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeVehicleId: next.activeVehicleId }),
    });
  }
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

  useEffect(() => {
    if (cloudSyncStarted) return;
    cloudSyncStarted = true;
    void syncCloudGarage(garage);
  }, [garage]);

  return {
    garage,
    activeVehicle,
    saveVehicle(draft: VehicleDraft) {
      const next = upsertVehicle(garage, draft);
      persistGarage(next);
      const saved = draft.id
        ? next.vehicles.find((vehicle) => vehicle.id === draft.id)
        : next.vehicles.at(-1);
      if (saved) void saveVehicleToCloud(saved);
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
      void fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    },
    setActiveVehicle(id: string) {
      if (!garage.vehicles.some((vehicle) => vehicle.id === id)) return;
      persistGarage({ ...garage, activeVehicleId: id });
      void fetch("/api/vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeVehicleId: id }),
      });
    },
    setPendingVin(vin: string) {
      persistGarage({ ...garage, pendingVin: vin });
    },
    clearPendingVin() {
      persistGarage({ ...garage, pendingVin: undefined });
    },
    updateActiveVehicle(patch: Partial<SavedVehicle>) {
      if (!activeVehicle) return;
      const next = upsertVehicle(garage, {
        ...activeVehicle,
        ...patch,
        id: activeVehicle.id,
      });
      persistGarage(next);
      const saved = next.vehicles.find(
        (vehicle) => vehicle.id === activeVehicle.id,
      );
      if (saved) void saveVehicleToCloud(saved);
    },
  };
}
