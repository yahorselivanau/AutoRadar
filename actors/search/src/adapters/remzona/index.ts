import type { SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type AdapterResult,
  type PartsSourceAdapter,
} from "../types";
import { loadRemzonaSearchHtml, type LoadedRemzonaHtml } from "./loader";
import { parseRemzonaSearchHtml } from "./parser";

export type RemzonaHtmlLoader = (query: string) => Promise<LoadedRemzonaHtml>;

export function getRemzonaQuery(input: SearchRequest): string {
  const query =
    input.part.rawPartNumber?.trim() ||
    input.part.normalizedPartNumber?.trim() ||
    input.part.name.trim();
  if (query.length < 3) {
    throw new AdapterError(
      "remzona",
      "unsupported-query",
      "Для поиска Remzona нужно минимум три символа",
    );
  }
  return query;
}

export class RemzonaPartsAdapter implements PartsSourceAdapter {
  readonly id = "remzona";

  constructor(
    private readonly loadHtml: RemzonaHtmlLoader = loadRemzonaSearchHtml,
  ) {}

  async search(input: SearchRequest): Promise<AdapterResult> {
    const query = getRemzonaQuery(input);
    const loaded = await this.loadHtml(query);
    return {
      method: "html",
      offers: parseRemzonaSearchHtml(loaded.html),
    };
  }
}

export { createRemzonaHtmlLoader } from "./loader";
export { parseRemzonaSearchHtml } from "./parser";
