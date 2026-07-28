import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

import {
  AdapterError,
  type PartsSourceAdapter,
  type RetrievalMethod,
} from "./adapters/types";

export interface FederatedSourceResult {
  sourceId: string;
  method?: RetrievalMethod;
  offers: NormalizedOffer[];
  error?: {
    code: string;
    message: string;
  };
}

export interface FederatedSearchResult {
  offers: NormalizedOffer[];
  sources: FederatedSourceResult[];
}

export async function runFederatedSearch(
  input: SearchRequest,
  adapters: readonly PartsSourceAdapter[],
): Promise<FederatedSearchResult> {
  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.search(input)),
  );
  const sources = settled.map((entry, index): FederatedSourceResult => {
    const sourceId = adapters[index]?.id ?? "unknown";
    if (entry.status === "fulfilled") {
      return {
        sourceId,
        method: entry.value.method,
        offers: entry.value.offers,
      };
    }

    const error: unknown = entry.reason;
    return {
      sourceId,
      offers: [],
      error: {
        code: error instanceof AdapterError ? error.code : "unknown",
        message: error instanceof Error ? error.message : "Неизвестная ошибка",
      },
    };
  });

  return {
    offers: sources.flatMap((source) => source.offers),
    sources,
  };
}
