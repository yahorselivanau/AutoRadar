import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type SearchRequest,
} from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { readDavinagazTransportConfig } from "./config";
import { loadDavinagazSearchHtml, type LoadedDavinagazHtml } from "./loader";
import { parseDavinagazSearchHtml } from "./parser";

export type DavinagazHtmlLoader = (
  article: string,
) => Promise<LoadedDavinagazHtml>;

export function getDavinagazArticle(input: SearchRequest): string {
  const article =
    input.part.rawPartNumber?.trim() || input.part.normalizedPartNumber?.trim();
  if (!article) {
    throw new AdapterError(
      "davinagaz",
      "unsupported-query",
      "EMPTY_RESPONSE: Davinagaz.by поддерживает только подтверждённый поиск по артикулу",
    );
  }
  return article;
}

export class DavinagazPartsAdapter implements PartsSourceAdapter {
  readonly id = "davinagaz";

  constructor(
    private readonly loadHtml: DavinagazHtmlLoader = loadDavinagazSearchHtml,
    private readonly resultLimit = readDavinagazTransportConfig()
      .DAVINAGAZ_RESULT_LIMIT,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    const article = getDavinagazArticle(input);
    const loaded = await this.loadHtml(article);
    const requestedArticle = normalizePartNumber(article);
    const offers = parseDavinagazSearchHtml(
      loaded.html,
      new Date().toISOString(),
      this.resultLimit,
    ).flatMap((offer) =>
      offer.normalizedPartNumber === requestedArticle
        ? [
            NormalizedOfferSchema.parse({
              ...offer,
              matchStatus: "confirmed",
              matchReasons: ["Точный артикул в карточке Davinagaz.by"],
            }),
          ]
        : [],
    );
    return { method: loaded.method, offers };
  }
}

export {
  createDavinagazSearchLoader,
  loadDavinagazPlaywrightHtml,
  loadDavinagazSearchHtml,
} from "./loader";
export { hashDavinagazPayload, parseDavinagazSearchHtml } from "./parser";
