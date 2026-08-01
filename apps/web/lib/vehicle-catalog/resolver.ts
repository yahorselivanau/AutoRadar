import "server-only";

import { SearchRequestSchema, type SearchRequest } from "@autoradar/domain";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

import {
  normalizeVehicleCatalogText,
  selectVehicleCatalogMatches,
  type VehicleCatalogModel,
} from "./matching";

type VehicleMakeRow = {
  id: number;
  name: string;
  name_normalized: string;
  name_ru_normalized: string | null;
};

type VehicleModelRow = {
  id: number;
  make_id: number;
  name: string;
  name_normalized: string;
  generation: string | null;
  body_type: string | null;
  year_from: number | null;
  year_to: number | null;
};

export type VehicleCatalogSource = "zap.by" | "armtek";

export type VehicleCatalogResolution = {
  source: VehicleCatalogSource;
  make: string;
  model: string;
  matches: Array<{
    id: number;
    name: string;
    generation?: string;
    bodyType?: string;
    yearFrom?: number;
    yearTo?: number;
  }>;
  resolved: boolean;
};

function toCatalogModel(row: VehicleModelRow): VehicleCatalogModel {
  return {
    id: row.id,
    makeId: row.make_id,
    name: row.name,
    nameNormalized: row.name_normalized,
    generation: row.generation ?? undefined,
    bodyType: row.body_type ?? undefined,
    yearFrom: row.year_from ?? undefined,
    yearTo: row.year_to ?? undefined,
  };
}

async function resolveCatalog(
  input: NonNullable<SearchRequest["vehicle"]>,
  source: VehicleCatalogSource,
): Promise<VehicleCatalogResolution | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const makeName = normalizeVehicleCatalogText(input.make);
  const { data: makeRows, error: makeError } = await admin
    .from("vehicle_catalog_makes")
    .select("id,name,name_normalized,name_ru_normalized")
    .eq("source", source)
    .or(`name_normalized.eq.${makeName},name_ru_normalized.eq.${makeName}`)
    .limit(2);
  if (makeError) throw makeError;
  const make = (makeRows as VehicleMakeRow[] | null)?.[0];
  if (!make) return null;

  const { data: modelRows, error: modelError } = await admin
    .from("vehicle_catalog_models")
    .select(
      "id,make_id,name,name_normalized,generation,body_type,year_from,year_to",
    )
    .eq("make_id", make.id)
    .eq("source", source)
    .limit(1000);
  if (modelError) throw modelError;

  const matches = selectVehicleCatalogMatches({
    models: ((modelRows as VehicleModelRow[] | null) ?? []).map(toCatalogModel),
    model: input.model,
    year: input.year,
    generation: input.generation,
    body: input.body,
  });

  return {
    source,
    make: make.name,
    model: input.model,
    matches: matches.map((match) => ({
      id: match.id,
      name: match.name,
      generation: match.label,
      bodyType: match.bodyType,
      yearFrom: match.yearFrom,
      yearTo: match.yearTo,
    })),
    resolved: matches.length === 1,
  };
}

export async function resolveVehicleCatalog(
  input: NonNullable<SearchRequest["vehicle"]>,
  source: VehicleCatalogSource = "zap.by",
): Promise<VehicleCatalogResolution | null> {
  try {
    return await resolveCatalog(input, source);
  } catch (error) {
    console.warn(
      "Vehicle catalog lookup failed; continuing without enrichment",
      error,
    );
    return null;
  }
}

export async function enrichSearchRequestWithVehicleCatalog(
  input: SearchRequest,
  source: VehicleCatalogSource = "zap.by",
): Promise<SearchRequest> {
  if (!input.vehicle) return input;
  const resolution = await resolveVehicleCatalog(input.vehicle, source);
  const match = resolution?.resolved ? resolution.matches[0] : undefined;
  if (!match) return input;

  return SearchRequestSchema.parse({
    ...input,
    vehicle: {
      ...input.vehicle,
      make: resolution?.make ?? input.vehicle.make,
      generation: input.vehicle.generation ?? match.generation,
      body: input.vehicle.body ?? match.bodyType,
    },
  });
}
