import {
  VinResolutionSchema,
  VinSchema,
  maskVin,
  type VinResolution,
} from "@autoradar/domain";
import { z } from "zod";

const VpicResponseSchema = z.object({
  Results: z
    .array(
      z
        .object({
          Make: z.string().optional(),
          Model: z.string().optional(),
          ModelYear: z.string().optional(),
          BodyClass: z.string().optional(),
          EngineModel: z.string().optional(),
          DisplacementL: z.string().optional(),
          FuelTypePrimary: z.string().optional(),
          TransmissionStyle: z.string().optional(),
          Doors: z.string().optional(),
          ErrorCode: z.string().optional(),
          ErrorText: z.string().optional(),
        })
        .passthrough(),
    )
    .min(1),
});

type VpicRow = z.infer<typeof VpicResponseSchema>["Results"][number];

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result && result !== "Not Applicable" ? result : undefined;
}

export function parseVpicResponse(
  vin: string,
  payload: unknown,
  now = new Date(),
): VinResolution {
  const normalizedVin = VinSchema.parse(vin);
  const row: VpicRow = VpicResponseSchema.parse(payload).Results[0]!;
  const yearText = clean(row.ModelYear);
  const year =
    yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  const doorsText = clean(row.Doors);
  const doors =
    doorsText && /^[2-6]$/.test(doorsText) ? Number(doorsText) : undefined;
  const engine = [
    clean(row.EngineModel),
    clean(row.DisplacementL) ? `${clean(row.DisplacementL)} л` : undefined,
    clean(row.FuelTypePrimary),
  ]
    .filter(Boolean)
    .join(", ");
  const candidate = {
    id: "nhtsa-vpic-1",
    source: "nhtsa-vpic" as const,
    confidence: "low" as const,
    make: clean(row.Make),
    model: clean(row.Model),
    year,
    body: clean(row.BodyClass),
    engine: engine || undefined,
    transmission: clean(row.TransmissionStyle),
    doors,
    evidence: [
      row.Make ? "Make" : null,
      row.Model ? "Model" : null,
      row.ModelYear ? "ModelYear" : null,
      row.BodyClass ? "BodyClass" : null,
    ].filter((value): value is string => Boolean(value)),
  };
  const hasAnyVehicleField = Boolean(
    candidate.make || candidate.model || candidate.year,
  );
  const complete = Boolean(candidate.make && candidate.model && candidate.year);
  const errorText = clean(row.ErrorText)?.replaceAll(
    normalizedVin,
    maskVin(normalizedVin),
  );

  return VinResolutionSchema.parse({
    status: complete
      ? "resolved"
      : hasAnyVehicleField
        ? "partial"
        : "unresolved",
    maskedVin: maskVin(normalizedVin),
    source: "nhtsa-vpic",
    candidates: hasAnyVehicleField ? [candidate] : [],
    warnings: [
      ...(complete
        ? []
        : ["Данные vPIC неполные — проверьте и дополните автомобиль вручную."]),
      ...(errorText && row.ErrorCode !== "0" ? [errorText] : []),
    ],
    resolvedAt: now.toISOString(),
  });
}

export async function resolveVinWithVpic(
  vin: string,
  fetcher: typeof fetch = fetch,
): Promise<VinResolution> {
  const normalizedVin = VinSchema.parse(vin);
  const response = await fetcher(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(normalizedVin)}?format=json`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`vpic_http_${response.status}`);
  }
  return parseVpicResponse(normalizedVin, await response.json());
}
