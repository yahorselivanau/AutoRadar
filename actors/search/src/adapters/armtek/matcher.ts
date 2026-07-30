import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
  type SearchRequest,
} from "@autoradar/domain";

function words(value: string): string[] {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .split(/[^a-zа-я0-9]+/gi)
    .filter((token) => token.length >= 2);
}

function wordMatches(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  const prefixLength = Math.min(expected.length, actual.length);
  return (
    prefixLength >= 5 &&
    expected.slice(0, prefixLength - 1) === actual.slice(0, prefixLength - 1)
  );
}

function containsWords(expected: string, actual: string): boolean {
  const actualWords = words(actual);
  const expectedWords = words(expected);
  return (
    expectedWords.length > 0 &&
    expectedWords.every((expectedWord) =>
      actualWords.some((actualWord) => wordMatches(expectedWord, actualWord)),
    )
  );
}

function vehicleEvidence(input: SearchRequest, evidence: string): boolean {
  if (!input.vehicle) return true;
  const strongIdentities = [
    input.vehicle.generation,
    input.vehicle.model && input.vehicle.model.length >= 2
      ? input.vehicle.model
      : undefined,
    input.vehicle.engine,
  ].filter((value): value is string => Boolean(value?.trim()));
  if (strongIdentities.length > 0) {
    return strongIdentities.some((value) => containsWords(value, evidence));
  }
  return containsWords(input.vehicle.make, evidence);
}

function evidenceText(offer: NormalizedOffer): string {
  return [
    offer.title,
    offer.description,
    offer.rawPartNumber,
    offer.brand,
    offer.compatibilityText,
  ]
    .filter(Boolean)
    .join(" ");
}

export function evaluateArmtekOffer(
  offer: NormalizedOffer,
  input: SearchRequest,
): NormalizedOffer | undefined {
  const requestedPartNumber =
    input.part.normalizedPartNumber ??
    (input.part.rawPartNumber
      ? normalizePartNumber(input.part.rawPartNumber)
      : undefined);

  if (requestedPartNumber) {
    if (offer.normalizedPartNumber !== requestedPartNumber) return undefined;
    return NormalizedOfferSchema.parse({
      ...offer,
      matchStatus: "confirmed",
      matchReasons: ["Точный артикул в публичной выдаче Armtek.by"],
    });
  }

  if (
    offer.priceAmount !== undefined &&
    offer.priceAmount !== null &&
    (offer.priceAmount === "0" || offer.priceAmount === "0.00")
  ) {
    return undefined;
  }

  const evidence = evidenceText(offer);
  if (
    !containsWords(input.part.name, evidence) ||
    !vehicleEvidence(input, evidence)
  ) {
    return undefined;
  }

  const matchReasons: string[] = [
    input.vehicle
      ? "Название детали и идентификатор автомобиля присутствуют в выдаче Armtek.by"
      : "Название детали присутствует в выдаче Armtek.by",
  ];

  if (offer.compatibilityText && input.vehicle) {
    const vehicleCompatibility = [
      input.vehicle.generation,
      input.vehicle.model && input.vehicle.model.length >= 2
        ? input.vehicle.model
        : undefined,
      input.vehicle.engine,
    ]
      .filter(Boolean)
      .join(" ");
    if (
      vehicleCompatibility &&
      containsWords(vehicleCompatibility, offer.compatibilityText)
    ) {
      matchReasons.push("Совместимость указана в названии товара");
    }
  }

  return NormalizedOfferSchema.parse({
    ...offer,
    matchStatus: "possible",
    matchReasons,
  });
}
