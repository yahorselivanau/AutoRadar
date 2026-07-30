import {
  SourceSearchPlanSchema,
  normalizePartNumber,
  type SearchRequest,
  type SourceId,
  type SourceSearchPlan,
  type SourceSearchPlanEntry,
} from "@autoradar/domain";

import type { PartsSourceAdapter } from "./adapters/types";
import { sourcePartQuery } from "./part-synonyms.v1";
import { canonicalVehicleMake } from "./vehicle-makes.v1";

const CATEGORY_PART_PATTERN =
  /(?:масл|фильтр|антифриз|жидкост|ламп|аккумулятор|свеч|щетк|коврик|чехл)/i;

function vehicleQuery(input: SearchRequest, sourceId: SourceId): string {
  const vehicle = input.vehicle;
  return [
    sourcePartQuery(input.part.name, sourceId),
    vehicle?.make ? canonicalVehicleMake(vehicle.make) : undefined,
    vehicle?.model,
    vehicle?.year,
    vehicle?.generation,
    vehicle?.body,
    vehicle?.engine,
  ]
    .filter(Boolean)
    .join(" ");
}

export function planSourceSearch(
  input: SearchRequest,
  adapters: readonly PartsSourceAdapter[],
): SourceSearchPlan {
  const entries = adapters.map((adapter): SourceSearchPlanEntry => {
    const sourceId = adapter.id as SourceId;
    const capabilities = adapter.capabilities;
    const requestedCondition = input.part.condition;
    if (
      requestedCondition !== "any" &&
      !capabilities.conditions.includes(requestedCondition)
    ) {
      return {
        sourceId,
        strategy: "skip",
        query: null,
        skipReason: `Источник не поддерживает состояние «${requestedCondition}».`,
      };
    }

    const rawArticle =
      input.part.rawPartNumber ?? input.part.normalizedPartNumber;
    if (rawArticle && capabilities.article) {
      return {
        sourceId,
        strategy: "article",
        query: rawArticle,
        skipReason: null,
      };
    }

    if (
      input.vehicle?.make &&
      input.vehicle.model &&
      capabilities.vehicleCatalog
    ) {
      return {
        sourceId,
        strategy: "vehicle_catalog",
        query: vehicleQuery(input, sourceId),
        skipReason: null,
      };
    }

    if (CATEGORY_PART_PATTERN.test(input.part.name) && capabilities.category) {
      return {
        sourceId,
        strategy: "category",
        query: vehicleQuery(input, sourceId),
        skipReason: null,
      };
    }

    if (capabilities.text) {
      return {
        sourceId,
        strategy: "text",
        query:
          rawArticle && !capabilities.article
            ? `${input.part.name} ${normalizePartNumber(rawArticle)}`
            : vehicleQuery(input, sourceId),
        skipReason: null,
      };
    }

    return {
      sourceId,
      strategy: "skip",
      query: null,
      skipReason: "Источник не поддерживает подходящий режим поиска.",
    };
  });

  return SourceSearchPlanSchema.parse({ entries });
}
