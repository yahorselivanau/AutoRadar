import { SearchVehicleContextSchema } from "@autoradar/domain";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  resolveVehicleCatalog,
  type VehicleCatalogSource,
} from "@/lib/vehicle-catalog/resolver";

const VehicleCatalogSourceSchema = z.enum(["zap.by", "armtek"]);

const ResolveVehicleCatalogRequestSchema = SearchVehicleContextSchema.extend({
  year: SearchVehicleContextSchema.shape.year.optional(),
  source: VehicleCatalogSourceSchema.default("zap.by"),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Каталог автомобилей пока не настроен." },
      { status: 503 },
    );
  }

  const parsed = ResolveVehicleCatalogRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      {
        error: "Некорректные параметры автомобиля.",
        details: z.flattenError(parsed.error),
      },
      { status: 400 },
    );
  }

  const resolution = await resolveVehicleCatalog(
    parsed.data,
    parsed.data.source as VehicleCatalogSource,
  );
  return Response.json(
    resolution ?? {
      make: parsed.data.make,
      model: parsed.data.model,
      source: parsed.data.source,
      matches: [],
      resolved: false,
    },
  );
}
