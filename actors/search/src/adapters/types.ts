import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

export type RetrievalMethod = "mock" | "http" | "html" | "json" | "playwright";

export interface AdapterResult {
  method: RetrievalMethod;
  offers: NormalizedOffer[];
}

export interface PartsSourceAdapter {
  readonly id: string;
  search(input: SearchRequest): Promise<AdapterResult>;
}
