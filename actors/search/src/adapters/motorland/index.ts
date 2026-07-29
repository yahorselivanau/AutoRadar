import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readMotorlandTransportConfig } from "./config";
import { loadMotorlandSearchHtml, type LoadedMotorlandHtml } from "./loader";
import { comparableMotorlandText, parseMotorlandSearchHtml } from "./parser";

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

function matchesRequest(offer: NormalizedOffer, input: SearchRequest): boolean {
  const requestedPartNumber =
    input.part.normalizedPartNumber ??
    (input.part.rawPartNumber
      ? input.part.rawPartNumber.replace(/[^a-zа-я0-9]/gi, "").toUpperCase()
      : undefined);
  if (requestedPartNumber) {
    return offer.normalizedPartNumber === requestedPartNumber;
  }

  const category =
    offer.sourceAttributes?.["Категория Motorland"]?.[0] ?? offer.title;
  if (
    comparableMotorlandText(category) !==
    comparableMotorlandText(input.part.name)
  ) {
    return false;
  }

  const title = comparableMotorlandText(offer.title);
  return [input.vehicle?.make, input.vehicle?.model]
    .filter((value): value is string => Boolean(value))
    .every((value) => title.includes(comparableMotorlandText(value)));
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
    const offers = parseMotorlandSearchHtml(
      loaded.html,
      new Date().toISOString(),
      this.resultLimit,
    ).filter((offer) => matchesRequest(offer, input));
    return { method: "html", offers };
  }
}

export { createMotorlandSearchLoader, loadMotorlandSearchHtml } from "./loader";
export { normalizeMotorlandPrice, parseMotorlandSearchHtml } from "./parser";
