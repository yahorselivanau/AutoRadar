import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
  type SearchRequest,
} from "@autoradar/domain";

import type {
  Auto1Brand,
  Auto1Engine,
  Auto1Group,
  Auto1Model,
} from "./parser";

const RU_LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш",
  o: "щ", p: "з", "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а",
  g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "э", z: "я",
  x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю",
  "/": ".", "`": "ё",
};

function ruLayout(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .split("")
    .map((char) => RU_LAYOUT[char] ?? char)
    .join("");
}

function normalized(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedWords(value: string): string[] {
  return normalized(value)
    .split(/[^a-zа-я0-9]+/gi)
    .filter((token) => token.length >= 3);
}

function yearsOverlap(
  vehicleYear: number | undefined,
  yearFrom: string | undefined,
  yearTo: string | undefined,
): boolean {
  if (!vehicleYear) return true;
  const from = yearFrom ? Number(yearFrom) : undefined;
  const to = yearTo ? Number(yearTo) : undefined;
  if (from !== undefined && vehicleYear < from) return false;
  if (to !== undefined && vehicleYear > to) return false;
  return true;
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

export function findAuto1Brand(
  brands: readonly Auto1Brand[],
  make: string | undefined,
): Auto1Brand | undefined {
  if (!make) return undefined;
  const canonical = normalized(make);
  const layout = ruLayout(make);
  return brands.find((brand) => {
    if (normalized(brand.name) === canonical) return true;
    return brand.aliases.some(
      (alias) =>
        normalized(alias) === canonical || normalized(alias) === layout,
    );
  });
}

export function resolveAuto1Model(
  models: readonly Auto1Model[],
  model: string | undefined,
  year: number | undefined,
): Auto1Model[] {
  if (!model) return [];
  const requestedTokens = normalizedWords(model);
  const layout = ruLayout(model);
  const candidates = models.filter((candidate) => {
    if (normalized(candidate.title) === normalized(model)) return true;
    const titleTokens = normalizedWords(candidate.title);
    const layoutMatch = normalizedWords(layout).every((token) =>
      titleTokens.some(
        (titleToken) =>
          titleToken === token || titleToken.startsWith(token),
      ),
    );
    return (
      layoutMatch ||
      requestedTokens.every((token) =>
        titleTokens.some(
          (titleToken) => titleToken === token || titleToken.startsWith(token),
        ),
      )
    );
  });
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;
  const yearCandidates = candidates.filter((candidate) =>
    yearsOverlap(year, candidate.yearFrom, candidate.yearTo),
  );
  const unique = (yearCandidates.length > 0 ? yearCandidates : candidates).filter(
    (candidate, index, list) =>
      list.findIndex((item) => item.modelId === candidate.modelId) === index,
  );
  return unique.length > 0 ? unique : candidates;
}

export function resolveAuto1Engine(
  engines: readonly Auto1Engine[],
  engine: string | undefined,
  year: number | undefined,
): Auto1Engine[] {
  if (!engine) return [];
  const requested = normalized(engine);
  const requestedTokens = normalizedWords(engine);
  const candidates = engines.filter((candidate) => {
    const haystack = normalized(
      [
        candidate.volume,
        candidate.displacement,
        candidate.powerKw,
        candidate.engineCode,
        candidate.fuel,
      ].join(" "),
    );
    if (requested.length >= 3 && haystack.includes(requested)) return true;
    if (requestedTokens.length === 0) return false;
    return requestedTokens.every((token) => haystack.includes(token));
  });
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;
  const yearCandidates = candidates.filter((candidate) =>
    yearsOverlap(year, candidate.yearFrom, candidate.yearTo),
  );
  const unique = (yearCandidates.length > 0 ? yearCandidates : candidates).filter(
    (candidate, index, list) =>
      list.findIndex((item) => item.engineId === candidate.engineId) === index,
  );
  return unique.length > 0 ? unique : candidates;
}

export function findAuto1Group(
  groups: readonly Auto1Group[],
  partName: string | undefined,
): Auto1Group | undefined {
  if (!partName) return undefined;
  const requested = normalized(partName);
  const requestedTokens = normalizedWords(partName);
  const exact = groups.find(
    (group) =>
      !group.folder &&
      (normalized(group.label) === requested ||
        normalized(group.label).replace(/ \/.*$/, "") === requested),
  );
  if (exact) return exact;
  const wordMatches = groups
    .filter(
      (group) =>
        !group.folder &&
        requestedTokens.every((token) =>
          normalizedWords(group.label).some(
            (labelToken) =>
              labelToken === token || labelToken.startsWith(token),
          ),
        ),
    )
    .sort(
      (left, right) =>
        normalizedWords(left.label).length - normalizedWords(right.label).length,
    );
  return wordMatches[0];
}
