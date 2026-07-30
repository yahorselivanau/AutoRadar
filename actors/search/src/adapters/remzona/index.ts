import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readRemzonaTransportConfig } from "./config";
import {
  loadRemzonaPageHtml,
  loadRemzonaPlaywrightHtml,
  loadRemzonaSearchHtml,
  type LoadedRemzonaHtml,
  type RemzonaPageLoader,
} from "./loader";
import {
  chooseRemzonaCandidate,
  filterRemzonaOffersByPlacement,
  findRemzonaMakeCatalogPath,
  findRemzonaModelCatalogPath,
  parseRemzonaCatalogHtml,
  parseRemzonaProductHtml,
  parseRemzonaSearchCandidates,
} from "./parser";

export type RemzonaDiagnosticReason =
  | "HTTP_BLOCKED"
  | "EMPTY_RESPONSE"
  | "PRICE_NOT_FOUND"
  | "DOM_CHANGED"
  | "TIMEOUT";

const diagnosticReasons: readonly RemzonaDiagnosticReason[] = [
  "HTTP_BLOCKED",
  "EMPTY_RESPONSE",
  "PRICE_NOT_FOUND",
  "DOM_CHANGED",
  "TIMEOUT",
];

export type RemzonaHtmlLoader = (query: string) => Promise<LoadedRemzonaHtml>;
export type RemzonaPlaywrightLoader = (
  path: string,
  selector: string,
) => Promise<LoadedRemzonaHtml>;

export function getRemzonaQuery(input: SearchRequest): string {
  const query =
    input.part.rawPartNumber?.trim() ||
    input.part.normalizedPartNumber?.trim() ||
    input.part.name.trim();
  if (query.length < 3) {
    throw new AdapterError(
      "remzona",
      "unsupported-query",
      "EMPTY_RESPONSE: для поиска Remzona нужно минимум три символа",
    );
  }
  return query;
}

function getVerifiedDirectCategory(input: SearchRequest):
  | {
      kind: "category";
      title: string;
      path: string;
    }
  | undefined {
  if (input.part.rawPartNumber || input.part.normalizedPartNumber) {
    return undefined;
  }
  const name = input.part.name
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
  return name === "стеклоподъемник"
    ? {
        kind: "category",
        title: "Стеклоподъемник",
        path: "/steklopodiemnik",
      }
    : undefined;
}

function diagnostic(
  reason: RemzonaDiagnosticReason,
  message: string,
): AdapterError {
  const code =
    reason === "HTTP_BLOCKED"
      ? "blocked"
      : reason === "TIMEOUT"
        ? "timeout"
        : reason === "DOM_CHANGED"
          ? "parse"
          : "unsupported-query";
  return new AdapterError("remzona", code, `${reason}: ${message}`);
}

export function getRemzonaDiagnosticReason(
  error: Error,
): RemzonaDiagnosticReason | undefined {
  return diagnosticReasons.find((reason) =>
    error.message.startsWith(`${reason}:`),
  );
}

function logPriceSources(offers: NormalizedOffer[]): void {
  const counts = offers.reduce<Record<string, number>>((result, offer) => {
    const source = offer.priceSource ?? "not_found";
    result[source] = (result[source] ?? 0) + 1;
    return result;
  }, {});
  console.info("Remzona price sources", counts);
}

export class RemzonaPartsAdapter implements PartsSourceAdapter {
  readonly id = "remzona";
  readonly capabilities = {
    article: true,
    vehicleCatalog: true,
    vin: false,
    text: true,
    category: true,
    conditions: ["new"],
  } as const;

  constructor(
    private readonly loadSearchHtml: RemzonaHtmlLoader = loadRemzonaSearchHtml,
    private readonly loadPageHtml: RemzonaPageLoader = loadRemzonaPageHtml,
    private readonly loadPlaywrightHtml: RemzonaPlaywrightLoader = loadRemzonaPlaywrightHtml,
    private readonly playwrightFallbackEnabled = readRemzonaTransportConfig()
      .REMZONA_PLAYWRIGHT_FALLBACK_ENABLED,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    const query = getRemzonaQuery(input);
    const candidate =
      getVerifiedDirectCategory(input) ??
      chooseRemzonaCandidate(
        parseRemzonaSearchCandidates((await this.loadSearchHtml(query)).html),
        input.part.name,
      );
    if (!candidate) {
      throw diagnostic(
        "EMPTY_RESPONSE",
        "публичный поиск Remzona не вернул категорию или товар",
      );
    }

    let targetPath = candidate.path;
    let loaded: LoadedRemzonaHtml;
    let parse: (html: string) => NormalizedOffer[];
    let selector: string;

    if (candidate.kind === "category") {
      loaded = await this.loadPageHtml(targetPath);

      if (input.vehicle) {
        const makePath = findRemzonaMakeCatalogPath(
          loaded.html,
          candidate.path,
          input.vehicle.make,
        );
        if (!makePath) {
          throw diagnostic(
            "EMPTY_RESPONSE",
            `марка ${input.vehicle.make} отсутствует в категории`,
          );
        }
        const makePage = await this.loadPageHtml(makePath);
        const modelPath = findRemzonaModelCatalogPath(
          makePage.html,
          makePath,
          input.vehicle.model,
        );
        if (!modelPath) {
          throw diagnostic(
            "EMPTY_RESPONSE",
            `модель ${input.vehicle.model} отсутствует в категории`,
          );
        }
        targetPath = modelPath;
        loaded = await this.loadPageHtml(targetPath);
      }

      parse = parseRemzonaCatalogHtml;
      selector = ".box-articleitems .item-list";
    } else {
      loaded = await this.loadPageHtml(targetPath);
      parse = (html) => parseRemzonaProductHtml(html, targetPath);
      selector = "h1";
    }

    let offers = parse(loaded.html);
    let method: AdapterResult["method"] = "html";
    const needsFallback =
      offers.length === 0 || offers.every((offer) => !offer.priceAmount);

    if (needsFallback && this.playwrightFallbackEnabled) {
      const fallback = await this.loadPlaywrightHtml(targetPath, selector);
      offers = parse(fallback.html);
      method = "playwright";
    }

    if (offers.length === 0) {
      throw diagnostic(
        loaded.html.includes("box-articleitems")
          ? "DOM_CHANGED"
          : "EMPTY_RESPONSE",
        "страница не содержит распознанных предложений",
      );
    }
    if (offers.every((offer) => !offer.priceAmount)) {
      throw diagnostic(
        "PRICE_NOT_FOUND",
        "ни один подтверждённый источник цены не найден",
      );
    }

    offers = filterRemzonaOffersByPlacement(offers, input.part);
    if (offers.length === 0) {
      throw diagnostic(
        "EMPTY_RESPONSE",
        "нет предложений с явно указанным положением детали",
      );
    }

    logPriceSources(offers);
    return { method, offers };
  }
}

export { createRemzonaHtmlLoader, createRemzonaPageLoader } from "./loader";
export {
  normalizeRemzonaPrice,
  parseRemzonaCatalogHtml,
  parseRemzonaProductHtml,
  parseRemzonaSearchCandidates,
} from "./parser";
