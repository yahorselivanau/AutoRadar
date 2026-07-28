import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

export type RetrievalMethod = "mock" | "http" | "html" | "json" | "playwright";

export interface AdapterResult {
  method: RetrievalMethod;
  offers: NormalizedOffer[];
}

export type AdapterErrorCode =
  | "blocked"
  | "network"
  | "parse"
  | "rate-limited"
  | "timeout"
  | "unsupported-query";

export class AdapterError extends Error {
  constructor(
    readonly sourceId: string,
    readonly code: AdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AdapterError";
  }
}

export interface PartsSourceAdapter {
  readonly id: string;
  search(input: SearchRequest): Promise<AdapterResult>;
}
