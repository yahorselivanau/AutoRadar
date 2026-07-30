import { SavedVehicleSchema } from "@autoradar/domain";
import { z } from "zod";

import { resolveRequestIdentity } from "@/lib/auth/identity";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  decryptVehicleSecret,
  encryptVehicleSecret,
} from "@/lib/vehicles/crypto";

const VehicleInputSchema = SavedVehicleSchema;

export async function GET() {
  const identity = await resolveRequestIdentity();
  if (identity.kind !== "user") {
    return Response.json({ code: "guest" });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return Response.json({ error: "Supabase не настроен." }, { status: 503 });
  }
  const { data, error } = await admin
    .from("vehicles")
    .select(
      "id,display_name,vin_encrypted,make,model,year,generation,body,engine,transmission,doors,notes,is_active,created_at,updated_at",
    )
    .eq("user_id", identity.userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const vehicles = (data ?? []).flatMap((row) => {
    try {
      return [
        SavedVehicleSchema.parse({
          id: row.id,
          displayName: row.display_name,
          vin: row.vin_encrypted
            ? decryptVehicleSecret(row.vin_encrypted)
            : undefined,
          make: row.make,
          model: row.model,
          year: row.year,
          generation: row.generation ?? undefined,
          body: row.body ?? undefined,
          engine: row.engine ?? undefined,
          transmission: row.transmission ?? undefined,
          doors: row.doors ?? undefined,
          notes: row.notes ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }),
      ];
    } catch {
      return [];
    }
  });
  const activeVehicleId =
    data?.find((row) => row.is_active)?.id ?? vehicles[0]?.id ?? null;
  return Response.json({ vehicles, activeVehicleId });
}

export async function POST(request: Request) {
  const identity = await resolveRequestIdentity();
  if (identity.kind !== "user") {
    return Response.json({ code: "guest", saved: false });
  }
  const parsed = VehicleInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Некорректные параметры автомобиля." },
      { status: 400 },
    );
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return Response.json({ error: "Supabase не настроен." }, { status: 503 });
  }
  const vehicle = parsed.data;
  const { data: existing, error: existingError } = await admin
    .from("vehicles")
    .select("user_id")
    .eq("id", vehicle.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.user_id !== identity.userId) {
    return Response.json({ error: "Доступ запрещён." }, { status: 403 });
  }
  const row = {
    id: vehicle.id,
    user_id: identity.userId,
    display_name: vehicle.displayName,
    vin_encrypted: vehicle.vin ? encryptVehicleSecret(vehicle.vin) : null,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    generation: vehicle.generation ?? null,
    body: vehicle.body ?? null,
    engine: vehicle.engine ?? null,
    transmission: vehicle.transmission ?? null,
    doors: vehicle.doors ?? null,
    notes: vehicle.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("vehicles").upsert(row, {
    onConflict: "id",
  });
  if (error) throw error;
  return Response.json({ saved: true });
}

export async function PATCH(request: Request) {
  const identity = await resolveRequestIdentity();
  if (identity.kind !== "user") {
    return Response.json({ code: "guest", saved: false });
  }
  const parsed = z
    .object({ activeVehicleId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Некорректный автомобиль." },
      { status: 400 },
    );
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return Response.json({ error: "Supabase не настроен." }, { status: 503 });
  }
  const { error: resetError } = await admin
    .from("vehicles")
    .update({ is_active: false })
    .eq("user_id", identity.userId);
  if (resetError) throw resetError;
  const { error } = await admin
    .from("vehicles")
    .update({ is_active: true })
    .eq("id", parsed.data.activeVehicleId)
    .eq("user_id", identity.userId);
  if (error) throw error;
  return Response.json({ saved: true });
}
