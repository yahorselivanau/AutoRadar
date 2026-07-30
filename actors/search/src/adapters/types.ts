import type {
  NormalizedOffer,
  SearchClarification,
  SearchRequest,
} from "@autoradar/domain";

export type RetrievalMethod = "mock" | "http" | "html" | "json" | "playwright";

export interface AdapterCapabilities {
  readonly article: boolean;
  readonly vehicleCatalog: boolean;
  readonly vin: boolean;
  readonly text: boolean;
  readonly category: boolean;
  readonly conditions: readonly ("new" | "used")[];
}

export interface AdapterResult {
  method: RetrievalMethod;
  offers: NormalizedOffer[];
  clarification?: SearchClarification;
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
  readonly capabilities: AdapterCapabilities;
  search(input: SearchRequest): Promise<AdapterResult>;
}
