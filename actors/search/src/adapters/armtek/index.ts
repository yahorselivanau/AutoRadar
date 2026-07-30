import type { SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readArmtekTransportConfig } from "./config";
import { loadArmtekSearchJson, type LoadedArmtekJson } from "./loader";
import { evaluateArmtekOffer } from "./matcher";
import { parseArmtekSearchPayload } from "./parser";

export type ArmtekJsonLoader = (query: string) => Promise<LoadedArmtekJson>;

export function getArmtekQuery(input: SearchRequest): string {
  const partNumber =
    input.part.rawPartNumber?.trim() || input.part.normalizedPartNumber?.trim();
  if (partNumber) return partNumber;

  if (input.query?.trim()) return input.query.trim();

  const values = [
    input.part.name,
    input.vehicle?.make,
    input.vehicle?.model,
    input.vehicle?.generation,
    input.vehicle?.engine,
  ].filter((value): value is string => Boolean(value?.trim()));
  const query = [...new Set(values.map((value) => value.trim()))].join(" ");
  if (query.length < 3) {
    throw new AdapterError(
      "armtek",
      "unsupported-query",
      "EMPTY_RESPONSE: для поиска Armtek.by нужно минимум три символа",
    );
  }
  return query;
}

export class ArmtekPartsAdapter implements PartsSourceAdapter {
  readonly id = "armtek";
  readonly capabilities = {
    article: true,
    vehicleCatalog: false,
    vin: false,
    text: true,
    category: true,
    conditions: ["new"],
  } as const;

  constructor(
    private readonly loadJson: ArmtekJsonLoader = loadArmtekSearchJson,
    private readonly resultLimit = readArmtekTransportConfig()
      .ARMTEK_RESULT_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (input.part.condition === "used") {
      return { method: "json", offers: [] };
    }
    const loaded = await this.loadJson(getArmtekQuery(input));
    const offers = parseArmtekSearchPayload(
      loaded.payload,
      new Date().toISOString(),
    )
      .flatMap((offer) => {
        const evaluated = evaluateArmtekOffer(offer, input);
        return evaluated ? [evaluated] : [];
      })
      .slice(0, this.resultLimit);
    return { method: "json", offers };
  }
}

export { createArmtekSearchLoader, loadArmtekSearchJson } from "./loader";
export { evaluateArmtekOffer } from "./matcher";
export { hashArmtekPayload, parseArmtekSearchPayload } from "./parser";
