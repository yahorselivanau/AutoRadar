import { VinSchema } from "@autoradar/domain";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveVinWithVpic } from "@/lib/vehicles/vin-resolver";
import { readMvpFeatureFlags } from "@/lib/mvp-feature-flags";

const ResolveVinInputSchema = z.object({ vin: VinSchema });

export async function POST(request: Request) {
  if (!readMvpFeatureFlags().vinResolver) {
    return NextResponse.json(
      { error: "vin_resolver_disabled" },
      { status: 404 },
    );
  }
  const parsed = ResolveVinInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_vin", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await resolveVinWithVpic(parsed.data.vin));
  } catch {
    return NextResponse.json(
      {
        error: "vin_resolver_unavailable",
        message:
          "Не удалось получить данные vPIC. Заполните автомобиль вручную.",
      },
      { status: 502 },
    );
  }
}
