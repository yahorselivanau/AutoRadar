import { createHash } from "node:crypto";

import type { SearchRequest } from "@autoradar/domain";

export function safeSearchLogContext(input: SearchRequest) {
  return {
    queryFingerprint: createHash("sha256")
      .update(input.query)
      .digest("hex")
      .slice(0, 12),
    vehicle: input.vehicle
      ? {
          make: input.vehicle.make,
          model: input.vehicle.model,
          year: input.vehicle.year,
          generation: input.vehicle.generation,
          body: input.vehicle.body,
        }
      : undefined,
    part: {
      name: input.part.name,
      condition: input.part.condition,
      hasPartNumber: Boolean(
        input.part.rawPartNumber || input.part.normalizedPartNumber,
      ),
      side: input.part.side,
      position: input.part.position,
    },
  };
}
