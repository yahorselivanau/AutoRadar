import {
  SearchRequestSchema,
  normalizePartNumber,
  type SearchRequest,
} from "@autoradar/domain";

import { canonicalVehicleMake } from "./vehicle-makes.v1";

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeSearchRequest(input: SearchRequest): SearchRequest {
  const parsed = SearchRequestSchema.parse(input);
  const rawPartNumber = parsed.part.rawPartNumber?.trim();

  return SearchRequestSchema.parse({
    ...parsed,
    query: clean(parsed.query),
    vehicle: parsed.vehicle
      ? {
          ...parsed.vehicle,
          make: canonicalVehicleMake(clean(parsed.vehicle.make)),
          model: clean(parsed.vehicle.model),
          generation: parsed.vehicle.generation
            ? clean(parsed.vehicle.generation)
            : undefined,
          body: parsed.vehicle.body ? clean(parsed.vehicle.body) : undefined,
          engine: parsed.vehicle.engine
            ? clean(parsed.vehicle.engine)
            : undefined,
          transmission: parsed.vehicle.transmission
            ? clean(parsed.vehicle.transmission)
            : undefined,
        }
      : undefined,
    part: {
      ...parsed.part,
      name: clean(parsed.part.name),
      rawPartNumber,
      normalizedPartNumber: rawPartNumber
        ? normalizePartNumber(rawPartNumber)
        : parsed.part.normalizedPartNumber?.trim(),
      constraints: parsed.part.constraints.map((constraint) => ({
        ...constraint,
        value: clean(constraint.value),
      })),
    },
  });
}
