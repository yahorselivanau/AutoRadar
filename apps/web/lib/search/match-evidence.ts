import {
  normalizePartNumber,
  type NormalizedOffer,
  type SearchRequest,
} from "@autoradar/domain";

export function applyStructuredMatchEvidence(
  offer: NormalizedOffer,
  request: SearchRequest,
): NormalizedOffer {
  const requestedArticle = request.part.normalizedPartNumber
    ? normalizePartNumber(request.part.normalizedPartNumber)
    : request.part.rawPartNumber
      ? normalizePartNumber(request.part.rawPartNumber)
      : null;
  const offeredArticle = offer.normalizedPartNumber
    ? normalizePartNumber(offer.normalizedPartNumber)
    : offer.rawPartNumber
      ? normalizePartNumber(offer.rawPartNumber)
      : null;

  if (
    requestedArticle &&
    offeredArticle &&
    requestedArticle === offeredArticle
  ) {
    return {
      ...offer,
      matchStatus: "confirmed",
      matchEvidence: {
        kind: "structured_article",
        requestedNormalizedArticle: requestedArticle,
        offeredNormalizedArticle: offeredArticle,
      },
    };
  }
  if (offer.matchEvidence?.kind === "source_vehicle_catalog") {
    return { ...offer, matchStatus: "confirmed" };
  }
  return {
    ...offer,
    matchStatus: "possible",
    matchEvidence:
      offer.matchEvidence?.kind === "textual"
        ? offer.matchEvidence
        : offer.matchReasons?.length
          ? { kind: "textual", matchedTerms: offer.matchReasons }
          : undefined,
  };
}
