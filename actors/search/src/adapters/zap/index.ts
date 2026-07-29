import {
  NormalizedOfferSchema,
  type NormalizedOffer,
  type SearchClarification,
  type SearchRequest,
} from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readZapTransportConfig } from "./config";
import {
  loadZapJson,
  loadZapPageHtml,
  type ZapJsonLoader,
  type ZapPageLoader,
} from "./loader";
import { evaluateZapOffers, findZapOfferClarification } from "./matcher";
import {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  findZapSearchCandidatePaths,
  parseZapCategoryId,
  parseZapCatalogHtml,
  parseZapChoiceHtml,
  parseZapChoiceUri,
  parseZapEngineVariants,
  parseZapProductHtml,
  parseZapVehicleVariants,
  resolveZapEngineVariants,
  resolveZapVehicleVariants,
} from "./parser";

export type ZapDiagnosticReason =
  | "ROBOTS_DISALLOWED"
  | "HTTP_BLOCKED"
  | "EMPTY_RESPONSE"
  | "DOM_CHANGED"
  | "TIMEOUT";

const diagnosticReasons: readonly ZapDiagnosticReason[] = [
  "ROBOTS_DISALLOWED",
  "HTTP_BLOCKED",
  "EMPTY_RESPONSE",
  "DOM_CHANGED",
  "TIMEOUT",
];

function diagnostic(
  reason: ZapDiagnosticReason,
  message: string,
): AdapterError {
  const code =
    reason === "ROBOTS_DISALLOWED"
      ? "unsupported-query"
      : reason === "HTTP_BLOCKED"
        ? "blocked"
        : reason === "TIMEOUT"
          ? "timeout"
          : reason === "DOM_CHANGED"
            ? "parse"
            : "unsupported-query";
  return new AdapterError("zap", code, `${reason}: ${message}`);
}

export function getZapDiagnosticReason(
  error: Error,
): ZapDiagnosticReason | undefined {
  return diagnosticReasons.find((reason) =>
    error.message.startsWith(`${reason}:`),
  );
}

export class ZapPartsAdapter implements PartsSourceAdapter {
  readonly id = "zap";

  constructor(
    private readonly loadPageHtml: ZapPageLoader = loadZapPageHtml,
    private readonly resultLimit = readZapTransportConfig().ZAP_RESULT_LIMIT,
    private readonly experimentalSearchEnabled = readZapTransportConfig()
      .ZAP_EXPERIMENTAL_SEARCH_ENABLED,
    private readonly loadJson: ZapJsonLoader = loadZapJson,
    private readonly enrichLimit = readZapTransportConfig().ZAP_ENRICH_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (!input.vehicle) {
      if (this.experimentalSearchEnabled) {
        return this.searchExperimental(input);
      }
      throw diagnostic(
        "ROBOTS_DISALLOWED",
        "поиск Zap.by по номеру и тексту запрещён robots.txt; для разрешённого каталога нужны марка и модель",
      );
    }

    const root = await this.loadPageHtml("/carparts");
    const makePath = findZapMakePath(root.html, input.vehicle.make);
    if (!makePath) {
      throw diagnostic(
        "EMPTY_RESPONSE",
        `марка ${input.vehicle.make} отсутствует в публичном каталоге Zap.by`,
      );
    }

    const makePage = await this.loadPageHtml(makePath);
    const modelPath = findZapModelPath(
      makePage.html,
      makePath,
      input.vehicle.model,
    );
    if (!modelPath) {
      throw diagnostic(
        "EMPTY_RESPONSE",
        `модель ${input.vehicle.model} отсутствует в каталоге ${input.vehicle.make}`,
      );
    }

    const modelPage = await this.loadPageHtml(modelPath);
    const selectedVariants = resolveZapVehicleVariants(
      parseZapVehicleVariants(modelPage.html),
      input.vehicle,
    );
    if (selectedVariants.length > 1) {
      return {
        method: "html",
        offers: [],
        clarification: this.vehicleClarification(
          "generation",
          "Уточните поколение или кузов автомобиля.",
          selectedVariants.slice(0, 8).map((variant) => ({
            id: variant.id,
            label: [
              variant.label,
              variant.yearFrom && variant.yearTo
                ? `${variant.yearFrom}–${variant.yearTo}`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · "),
            value: variant.label,
          })),
        ),
      };
    }
    const selectedVehicle = selectedVariants[0];
    const categoryPath = findZapCategoryPath(
      modelPage.html,
      modelPath,
      input.part.name,
    );
    if (!categoryPath) {
      throw diagnostic(
        "EMPTY_RESPONSE",
        `категория ${input.part.name} отсутствует для ${input.vehicle.make} ${input.vehicle.model}`,
      );
    }

    let catalogPage = await this.loadPageHtml(categoryPath);

    if (selectedVehicle && input.vehicle.engine) {
      const choice = await this.loadJson("/index.php", {
        route: "catalog/parts/choice3d",
        model: selectedVehicle.id,
      });
      const choiceHtml = parseZapChoiceHtml(choice);
      const engines = choiceHtml
        ? resolveZapEngineVariants(
            parseZapEngineVariants(choiceHtml),
            input.vehicle.engine,
            input.vehicle.year,
          )
        : [];
      if (engines.length > 1) {
        return {
          method: "json",
          offers: [],
          clarification: this.vehicleClarification(
            "engine",
            "Уточните двигатель автомобиля.",
            engines.map((engine) => ({
              id: engine.id,
              label: [engine.label, engine.details].filter(Boolean).join(" · "),
              value: engine.label,
            })),
          ),
        };
      }
      const categoryId = parseZapCategoryId(catalogPage.html);
      const engine = engines[0];
      if (engine && categoryId) {
        const exactChoice = await this.loadJson("/index.php", {
          route: "catalog/parts/choice3d",
          type: engine.id,
          category: categoryPath.split("/").filter(Boolean).at(-1) ?? "",
          category_id: categoryId,
        });
        const uri = parseZapChoiceUri(exactChoice);
        if (uri) catalogPage = await this.loadPageHtml(`/carparts/${uri}`);
      }
    }

    const catalogOffers = parseZapCatalogHtml(
      catalogPage.html,
      new Date().toISOString(),
      this.resultLimit,
    );
    if (catalogOffers.length === 0) {
      throw diagnostic(
        catalogPage.html.includes("product-block")
          ? "DOM_CHANGED"
          : "EMPTY_RESPONSE",
        "публичная SSR-страница Zap.by не содержит предложений",
      );
    }
    const offers = await this.prepareOffers(
      catalogOffers,
      input,
      selectedVehicle?.id,
    );
    if (offers.length === 0) {
      return { method: "html", offers: [] };
    }
    const clarification = findZapOfferClarification(offers, input);
    return {
      method: "html",
      offers: clarification ? [] : this.preferConfirmed(offers, input),
      clarification,
    };
  }

  private async searchExperimental(
    input: SearchRequest,
  ): Promise<AdapterResult> {
    const query =
      input.part.rawPartNumber?.trim() ||
      input.part.normalizedPartNumber?.trim() ||
      input.part.name.trim();
    const searchPage = await this.loadPageHtml(
      `/carparts/search/${encodeURIComponent(query)}`,
    );
    let offers = parseZapCatalogHtml(
      searchPage.html,
      new Date().toISOString(),
      this.resultLimit,
    );

    if (offers.length === 0) {
      const candidatePath = findZapSearchCandidatePaths(searchPage.html)[0];
      if (candidatePath) {
        const candidatePage = await this.loadPageHtml(candidatePath);
        offers = [
          ...parseZapProductHtml(candidatePage.html, candidatePath),
          ...parseZapCatalogHtml(
            candidatePage.html,
            new Date().toISOString(),
            this.resultLimit,
          ),
        ].slice(0, this.resultLimit);
      }
    }

    offers = await this.prepareOffers(offers, input);
    if (offers.length === 0) {
      return { method: "html", offers: [] };
    }
    const clarification = findZapOfferClarification(offers, input);
    return {
      method: "html",
      offers: clarification ? [] : this.preferConfirmed(offers, input),
      clarification,
    };
  }

  private async prepareOffers(
    offers: NormalizedOffer[],
    input: SearchRequest,
    vehicleModelId?: string,
  ): Promise<NormalizedOffer[]> {
    const candidates = evaluateZapOffers(offers, input, vehicleModelId).slice(
      0,
      this.enrichLimit,
    );
    const enriched = await Promise.all(
      candidates.map(async (offer) => {
        try {
          const productPath = new URL(offer.externalUrl).pathname;
          const page = await this.loadPageHtml(productPath);
          const details = parseZapProductHtml(
            page.html,
            productPath,
            offer.fetchedAt,
          )[0];
          if (!details) return offer;
          return NormalizedOfferSchema.parse({
            ...offer,
            ...details,
            priceAmount: offer.priceAmount ?? details.priceAmount,
            priceSource: offer.priceSource ?? details.priceSource,
            availability: offer.availability ?? details.availability,
            deliveryText: offer.deliveryText ?? details.deliveryText,
          });
        } catch {
          return offer;
        }
      }),
    );
    return evaluateZapOffers(enriched, input, vehicleModelId);
  }

  private preferConfirmed(
    offers: NormalizedOffer[],
    input: SearchRequest,
  ): NormalizedOffer[] {
    const hasHardConstraints =
      Boolean(input.vehicle) ||
      input.part.side !== "unknown" ||
      input.part.position !== "unknown" ||
      input.part.constraints.length > 0;
    const confirmed = offers.filter(
      (offer) => offer.matchStatus === "confirmed",
    );
    return hasHardConstraints && confirmed.length > 0 ? confirmed : offers;
  }

  private vehicleClarification(
    field: "generation" | "body" | "engine",
    question: string,
    options: SearchClarification["options"],
  ): SearchClarification {
    return {
      id: `zap-${field}`,
      field,
      question,
      options,
    };
  }
}

export {
  createZapClient,
  createZapPageLoader,
  resolveZapCatalogUrl,
} from "./loader";
export { matchesZapPartIdentity } from "./matcher";
export {
  detectZapPlacement,
  filterZapOffersByPlacement,
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  findZapSearchCandidatePaths,
  parseZapCatalogHtml,
  parseZapProductHtml,
  parseZapVehicleVariants,
  resolveZapVehicleVariants,
} from "./parser";
