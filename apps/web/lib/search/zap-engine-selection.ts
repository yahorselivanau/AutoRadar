import "server-only";

import { SearchRequestSchema, type SearchRequest } from "@autoradar/domain";
import {
  ZapPartsAdapter,
  type ZapEngineOptionsResult,
} from "@autoradar/search-actor/zap";

import { enrichSearchRequestWithVehicleCatalog } from "@/lib/vehicle-catalog/resolver";

export async function resolveZapEngineSelection(input: SearchRequest): Promise<{
  request: SearchRequest;
  result: ZapEngineOptionsResult;
}> {
  const request = await enrichSearchRequestWithVehicleCatalog(
    SearchRequestSchema.parse(input),
    "zap.by",
  );
  const adapter = new ZapPartsAdapter();
  return {
    request,
    result: await adapter.resolveEngineOptions(request),
  };
}
