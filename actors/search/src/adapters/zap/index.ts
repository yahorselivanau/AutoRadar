import type { SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readZapTransportConfig } from "./config";
import { loadZapPageHtml, type ZapPageLoader } from "./loader";
import {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  parseZapCatalogHtml,
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
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    if (!input.vehicle) {
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

    const catalogPage = await this.loadPageHtml(categoryPath);
    const offers = parseZapCatalogHtml(
      catalogPage.html,
      new Date().toISOString(),
      this.resultLimit,
    );
    if (offers.length === 0) {
      throw diagnostic(
        catalogPage.html.includes("product-block")
          ? "DOM_CHANGED"
          : "EMPTY_RESPONSE",
        "публичная SSR-страница Zap.by не содержит предложений",
      );
    }
    return { method: "html", offers };
  }
}

export { createZapPageLoader, resolveZapCatalogUrl } from "./loader";
export {
  findZapCategoryPath,
  findZapMakePath,
  findZapModelPath,
  parseZapCatalogHtml,
} from "./parser";
