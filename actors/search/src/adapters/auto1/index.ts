import type { SearchClarification, SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readAuto1TransportConfig } from "./config";
import {
  loadAuto1CatalogHtml,
  loadAuto1SearchHtml,
  type LoadedAuto1Html,
} from "./loader";
import {
  evaluateAuto1Offer,
  findAuto1Brand,
  findAuto1Group,
  resolveAuto1Engine,
  resolveAuto1Model,
} from "./matcher";
import {
  parseAuto1Brands,
  parseAuto1Engines,
  parseAuto1Groups,
  parseAuto1Models,
  parseAuto1SearchHtml,
  type Auto1Engine,
} from "./parser";

export type Auto1HtmlLoader = (query: string) => Promise<LoadedAuto1Html>;
export type Auto1CatalogLoader = (path: string) => Promise<LoadedAuto1Html>;

export function getAuto1Query(input: SearchRequest): string {
  const partNumber =
    input.part.rawPartNumber?.trim() || input.part.normalizedPartNumber?.trim();
  if (partNumber) return partNumber;

  if (input.query?.trim()) return input.query.trim();

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
  readonly capabilities = {
    article: true,
    vehicleCatalog: true,
    vin: false,
    text: true,
    category: false,
    conditions: ["new"],
  } as const;

  constructor(
    private readonly loadHtml: Auto1HtmlLoader = loadAuto1SearchHtml,
    private readonly loadCatalog: Auto1CatalogLoader = loadAuto1CatalogHtml,
    private readonly resultLimit = readAuto1TransportConfig()
      .AUTO1_RESULT_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (input.part.condition === "used") {
      return { method: "html", offers: [] };
    }
    const hasArticle = Boolean(
      input.part.rawPartNumber || input.part.normalizedPartNumber,
    );
    const canUseCatalog = Boolean(
      !hasArticle && input.vehicle?.make && input.vehicle.model,
    );
    if (canUseCatalog) {
      const catalogResult = await this.searchVehicleCatalog(input);
      if (catalogResult.offers.length > 0 || catalogResult.clarification) {
        return catalogResult;
      }
    }
    return this.searchDirect(input);
  }

  private async searchVehicleCatalog(input: SearchRequest): Promise<AdapterResult> {
    const vehicle = input.vehicle!;
    const root = await this.loadCatalog("/auto");
    const brand = findAuto1Brand(parseAuto1Brands(root.html), vehicle.make);
    if (!brand) return { method: "html", offers: [] };

    const makePage = await this.loadCatalog(`/auto/${brand.manufId}`);
    const models = resolveAuto1Model(
      parseAuto1Models(makePage.html),
      vehicle.model,
      vehicle.year,
    );
    if (models.length === 0) return { method: "html", offers: [] };
    if (models.length > 1) {
      return {
        method: "html",
        offers: [],
        clarification: this.clarification(
          "generation",
          "Уточните поколение или кузов автомобиля.",
          models.slice(0, 8).map((model) => ({
            id: model.modelId,
            label: [
              model.title,
              model.yearFrom && model.yearTo
                ? `${model.yearFrom}–${model.yearTo}`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · "),
            value: model.title,
          })),
        ),
      };
    }
    const model = models[0]!;

    const modelPage = await this.loadCatalog(
      `/auto/${brand.manufId}/${model.modelId}`,
    );
    const allEngines = parseAuto1Engines(modelPage.html);
    if (allEngines.length === 0) return { method: "html", offers: [] };
    const matchedEngines = vehicle.engine
      ? resolveAuto1Engine(allEngines, vehicle.engine, vehicle.year)
      : allEngines;
    if (matchedEngines.length === 1) {
      return this.searchEngineGroup(
        input,
        brand.manufId,
        model.modelId,
        matchedEngines[0]!,
      );
    }
    if (matchedEngines.length > 1) {
      return {
        method: "html",
        offers: [],
        clarification: this.clarification(
          "engine",
          "Уточните двигатель автомобиля.",
          matchedEngines.slice(0, 8).map((candidate) => ({
            id: candidate.engineId,
            label: engineLabel(candidate),
            value: candidate.volume ?? candidate.engineCode ?? "",
          })),
        ),
      };
    }
    return { method: "html", offers: [] };
  }

  private async searchEngineGroup(
    input: SearchRequest,
    manufId: string,
    modelId: string,
    engine: Auto1Engine,
  ): Promise<AdapterResult> {
    const enginePage = await this.loadCatalog(
      `/auto/${manufId}/${modelId}/${engine.engineId}`,
    );
    const group = findAuto1Group(
      parseAuto1Groups(enginePage.html),
      input.part.name,
    );
    if (!group) return { method: "html", offers: [] };

    const groupPage = await this.loadCatalog(
      `/auto/${manufId}/${modelId}/${engine.engineId}?groupId=${group.groupId}`,
    );
    const fetchedAt = new Date().toISOString();
    const parsedOffers = parseAuto1SearchHtml(
      groupPage.html,
      fetchedAt,
      this.resultLimit,
    );
    const offers = parsedOffers.flatMap((offer) => {
      const evaluated = evaluateAuto1Offer(offer, input);
      return evaluated ? [evaluated] : [];
    });
    return { method: "html", offers };
  }

  private async searchDirect(input: SearchRequest): Promise<AdapterResult> {
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

  private clarification(
    field: "generation" | "engine",
    question: string,
    options: SearchClarification["options"],
  ): SearchClarification {
    return {
      id: `auto1-${field}`,
      field,
      question,
      options,
    };
  }
}

function engineLabel(engine: Auto1Engine): string {
  return [
    engine.volume,
    engine.powerKw,
    engine.engineCode,
    engine.fuel,
  ]
    .filter(Boolean)
    .join(" · ");
}

export {
  createAuto1CatalogLoader,
  createAuto1SearchLoader,
  loadAuto1CatalogHtml,
  loadAuto1SearchHtml,
} from "./loader";
export {
  evaluateAuto1Offer,
  findAuto1Brand,
  findAuto1Group,
  resolveAuto1Engine,
  resolveAuto1Model,
} from "./matcher";
export {
  hashAuto1Payload,
  parseAuto1Brands,
  parseAuto1Engines,
  parseAuto1Groups,
  parseAuto1Models,
  parseAuto1SearchHtml,
} from "./parser";
