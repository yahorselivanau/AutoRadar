import type { SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readAuto1TransportConfig } from "./config";
import { loadAuto1SearchHtml, type LoadedAuto1Html } from "./loader";
import { evaluateAuto1Offer } from "./matcher";
import { parseAuto1SearchHtml } from "./parser";

export type Auto1HtmlLoader = (query: string) => Promise<LoadedAuto1Html>;

export function getAuto1Query(input: SearchRequest): string {
  const partNumber =
    input.part.rawPartNumber?.trim() || input.part.normalizedPartNumber?.trim();
  if (partNumber) return partNumber;

  const values = [
    input.part.name,
    input.vehicle?.make,
    input.vehicle?.model,
    input.vehicle?.year ? String(input.vehicle.year) : undefined,
    input.vehicle?.generation,
    input.vehicle?.engine,
  ].filter((value): value is string => Boolean(value?.trim()));
  const query = [...new Set(values.map((value) => value.trim()))].join(" ");
  if (query.length < 3) {
    throw new AdapterError(
      "auto1",
      "unsupported-query",
      "EMPTY_RESPONSE: для поиска Auto1.by нужно минимум три символа",
    );
  }
  return query;
}

export class Auto1PartsAdapter implements PartsSourceAdapter {
  readonly id = "auto1";

  constructor(
    private readonly loadHtml: Auto1HtmlLoader = loadAuto1SearchHtml,
    private readonly resultLimit = readAuto1TransportConfig()
      .AUTO1_RESULT_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (input.part.condition === "used") {
      return { method: "html", offers: [] };
    }
    const loaded = await this.loadHtml(getAuto1Query(input));
    const parsedOffers = parseAuto1SearchHtml(
      loaded.html,
      new Date().toISOString(),
      this.resultLimit,
    );
    const offers = parsedOffers.flatMap((offer) => {
      const evaluated = evaluateAuto1Offer(offer, input);
      return evaluated ? [evaluated] : [];
    });
    return { method: "html", offers };
  }
}

export { createAuto1SearchLoader, loadAuto1SearchHtml } from "./loader";
export { evaluateAuto1Offer } from "./matcher";
export { hashAuto1Payload, parseAuto1SearchHtml } from "./parser";
