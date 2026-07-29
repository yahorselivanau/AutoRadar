import { NormalizedOfferSchema, type SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readMotorlandTransportConfig } from "./config";
import { loadMotorlandSearchHtml, type LoadedMotorlandHtml } from "./loader";
import {
  evaluateMotorlandOffer,
  formatMotorlandGeneration,
  parseMotorlandProductIdentity,
} from "./matcher";
import { parseMotorlandSearchHtml } from "./parser";

export type MotorlandHtmlLoader = (
  query: string,
) => Promise<LoadedMotorlandHtml>;

export function getMotorlandQuery(input: SearchRequest): string {
  const partNumber =
    input.part.rawPartNumber?.trim() || input.part.normalizedPartNumber?.trim();
  if (partNumber) return partNumber;

  const values = [
    input.part.name,
    input.vehicle?.make,
    input.vehicle?.model,
    input.vehicle?.year ? String(input.vehicle.year) : undefined,
    input.vehicle?.generation,
  ].filter((value): value is string => Boolean(value?.trim()));
  const query = [...new Set(values.map((value) => value.trim()))].join(" ");
  if (query.length < 3) {
    throw new AdapterError(
      "motorland",
      "unsupported-query",
      "EMPTY_RESPONSE: для поиска Motorland нужно минимум три символа",
    );
  }
  return query;
}

export class MotorlandPartsAdapter implements PartsSourceAdapter {
  readonly id = "motorland";

  constructor(
    private readonly loadHtml: MotorlandHtmlLoader = loadMotorlandSearchHtml,
    private readonly resultLimit = readMotorlandTransportConfig()
      .MOTORLAND_RESULT_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (input.part.condition === "new") {
      return { method: "html", offers: [] };
    }
    const loaded = await this.loadHtml(getMotorlandQuery(input));
    const parsedOffers = parseMotorlandSearchHtml(
      loaded.html,
      new Date().toISOString(),
      this.resultLimit,
    );
    const rejections: Record<string, number> = {};
    const offers = parsedOffers.flatMap((offer) => {
      const evaluation = evaluateMotorlandOffer(offer, input);
      if (!evaluation.matches) {
        const reason = evaluation.reason ?? "unknown";
        rejections[reason] = (rejections[reason] ?? 0) + 1;
        return [];
      }
      return [
        NormalizedOfferSchema.parse({
          ...offer,
          matchStatus: "possible",
          matchReasons: evaluation.matchReasons,
        }),
      ];
    });

    console.info("[motorland] match summary", {
      parsed: parsedOffers.length,
      accepted: offers.length,
      rejections,
    });

    if (input.vehicle && !input.vehicle.generation) {
      const generations = new Map<
        string,
        NonNullable<ReturnType<typeof parseMotorlandProductIdentity>>
      >();
      for (const offer of offers) {
        const identity = parseMotorlandProductIdentity(offer.externalUrl);
        if (identity) generations.set(identity.generation, identity);
      }
      if (generations.size > 1) {
        return {
          method: "html",
          offers: [],
          clarification: {
            id: "motorland-generation",
            field: "generation",
            question: "Уточните поколение автомобиля.",
            options: [...generations.values()].slice(0, 8).map((identity) => ({
              id: `motorland-${identity.generation}`,
              label: formatMotorlandGeneration(identity),
              value: identity.generation,
            })),
          },
        };
      }
    }
    return { method: "html", offers };
  }
}

export { createMotorlandSearchLoader, loadMotorlandSearchHtml } from "./loader";
export { normalizeMotorlandPrice, parseMotorlandSearchHtml } from "./parser";
export {
  evaluateMotorlandOffer,
  parseMotorlandProductIdentity,
} from "./matcher";
