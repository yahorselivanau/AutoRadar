import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
  type SearchRequest,
} from "@autoradar/domain";

function normalizedWords(value: string): string[] {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .split(/[^a-zа-я0-9]+/gi)
    .filter((token) => token.length >= 3);
}

function wordsMatch(requested: string, actual: string): boolean {
  const actualWords = normalizedWords(actual);
  const requestedWords = normalizedWords(requested);
  return (
    requestedWords.length > 0 &&
    requestedWords.every((requestedWord) =>
      actualWords.some((actualWord) => {
        const prefixLength = Math.min(requestedWord.length, actualWord.length);
        return (
          requestedWord === actualWord ||
          (prefixLength >= 5 &&
            requestedWord.slice(0, prefixLength - 1) ===
              actualWord.slice(0, prefixLength - 1))
        );
      }),
    )
  );
}

function containsPartNumber(
  offer: NormalizedOffer,
  requested: string,
): boolean {
  if (offer.normalizedPartNumber === requested) return true;
  const haystack = normalizePartNumber(
    [offer.title, offer.description ?? ""].join(" "),
  );
  return haystack.includes(requested);
}

export function evaluateAuto1Offer(
  offer: NormalizedOffer,
  input: SearchRequest,
): NormalizedOffer | undefined {
  const requestedPartNumber =
    input.part.normalizedPartNumber ??
    (input.part.rawPartNumber
      ? normalizePartNumber(input.part.rawPartNumber)
      : undefined);
  const evidence = [
    offer.title,
    offer.description ?? "",
    offer.externalUrl,
  ].join(" ");
  const matches = requestedPartNumber
    ? containsPartNumber(offer, requestedPartNumber)
    : wordsMatch(input.part.name, evidence);
  if (!matches) return undefined;

  return NormalizedOfferSchema.parse({
    ...offer,
    matchStatus: "possible",
    matchReasons: [
      requestedPartNumber
        ? "Артикул присутствует в карточке Auto1.by"
        : "Название детали присутствует в карточке Auto1.by",
    ],
  });
}
