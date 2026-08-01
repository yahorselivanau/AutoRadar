import type { NormalizedOffer, SearchRequest } from "@autoradar/domain";

import { vehicleMakesMatch } from "../../vehicle-makes.v1";
import { matchesMotorlandCategory } from "./category-vocabulary";
import { comparableMotorlandText } from "./parser";

export type MotorlandRejectionReason =
  | "part"
  | "make"
  | "model"
  | "year-range-missing"
  | "year"
  | "generation"
  | "body"
  | "article";

export interface MotorlandProductIdentity {
  make: string;
  model: string;
  generation: string;
  part: string;
  yearFrom?: number;
  yearTo?: number;
}

export interface MotorlandMatchEvaluation {
  matches: boolean;
  reason?: MotorlandRejectionReason;
  identity?: MotorlandProductIdentity;
  matchReasons: string[];
}

function canonicalModel(value: string): string {
  return comparableMotorlandText(
    decodeURIComponent(value).replace(
      /(?:^|[\s_-])(?:series|serie|серия|серии)(?:$|[\s_-])/gi,
      " ",
    ),
  );
}

function parseYearRange(value: string): {
  yearFrom?: number;
  yearTo?: number;
} {
  const years =
    decodeURIComponent(value)
      .match(/\b(?:19|20)\d{2}\b/g)
      ?.map(Number) ?? [];
  return {
    yearFrom: years[0],
    yearTo: years[1],
  };
}

export function parseMotorlandProductIdentity(
  externalUrl: string,
): MotorlandProductIdentity | undefined {
  try {
    const url = new URL(externalUrl);
    if (url.protocol !== "https:" || url.hostname !== "motorland.by") {
      return undefined;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const skuIndex = segments.findIndex((segment) => /^sku-\d+$/.test(segment));
    if (
      segments[0] !== "auto-parts" ||
      skuIndex !== 5 ||
      !segments[1] ||
      !segments[2] ||
      !segments[3] ||
      !segments[4]
    ) {
      return undefined;
    }
    return {
      make: decodeURIComponent(segments[1]),
      model: decodeURIComponent(segments[2]),
      generation: decodeURIComponent(segments[3]),
      part: decodeURIComponent(segments[4]),
      ...parseYearRange(segments[3]),
    };
  } catch {
    return undefined;
  }
}

function matchesBody(actual: string, requested: string): boolean {
  const normalizedActual = comparableMotorlandText(actual);
  const normalizedRequested = comparableMotorlandText(requested);
  return (
    normalizedActual === normalizedRequested ||
    normalizedActual.startsWith(normalizedRequested)
  );
}

function meaningfulGenerationTokens(value: string): string[] {
  return value
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .split(/[^a-zа-я0-9]+/gi)
    .map(comparableMotorlandText)
    .filter((token) => token.length >= 2);
}

export function evaluateMotorlandOffer(
  offer: NormalizedOffer,
  input: SearchRequest,
): MotorlandMatchEvaluation {
  const identity = parseMotorlandProductIdentity(offer.externalUrl);
  if (!identity) {
    return { matches: false, reason: "model", matchReasons: [] };
  }

  const requestedPartNumber =
    input.part.normalizedPartNumber ??
    (input.part.rawPartNumber
      ? comparableMotorlandText(input.part.rawPartNumber).toUpperCase()
      : undefined);
  if (requestedPartNumber) {
    return offer.normalizedPartNumber === requestedPartNumber
      ? {
          matches: true,
          identity,
          matchReasons: ["Точный внутренний артикул Motorland"],
        }
      : { matches: false, reason: "article", identity, matchReasons: [] };
  }

  const category =
    offer.sourceAttributes?.["Категория Motorland"]?.[0] ?? identity.part;
  if (!matchesMotorlandCategory(category, input.part.name)) {
    return { matches: false, reason: "part", identity, matchReasons: [] };
  }

  const matchReasons = ["Точная категория Motorland"];
  if (!input.vehicle) {
    return { matches: true, identity, matchReasons };
  }

  if (!vehicleMakesMatch(offer.brand ?? identity.make, input.vehicle.make)) {
    return { matches: false, reason: "make", identity, matchReasons: [] };
  }
  if (canonicalModel(identity.model) !== canonicalModel(input.vehicle.model)) {
    return { matches: false, reason: "model", identity, matchReasons: [] };
  }
  matchReasons.push("Точная ветка марки и модели");

  const requestedGenerationTokens = input.vehicle.generation
    ? meaningfulGenerationTokens(input.vehicle.generation)
    : [];
  if (requestedGenerationTokens.length > 0) {
    const actualGeneration = comparableMotorlandText(identity.generation);
    const codeTokens = requestedGenerationTokens.filter((token) =>
      /\d/.test(token),
    );
    const descriptorTokens = requestedGenerationTokens.filter(
      (token) => !/\d/.test(token),
    );
    if (
      !descriptorTokens.every((token) => actualGeneration.includes(token)) ||
      (codeTokens.length > 0 &&
        !codeTokens.some((token) => actualGeneration.includes(token)))
    ) {
      return {
        matches: false,
        reason: "generation",
        identity,
        matchReasons: [],
      };
    }
    matchReasons.push("Поколение совпало");
  }

  if (!identity.yearFrom) {
    if (requestedGenerationTokens.length === 0) {
      return {
        matches: false,
        reason: "year-range-missing",
        identity,
        matchReasons: [],
      };
    }
  } else if (
    input.vehicle.year != null &&
    (input.vehicle.year < identity.yearFrom ||
      (identity.yearTo && input.vehicle.year > identity.yearTo))
  ) {
    return { matches: false, reason: "year", identity, matchReasons: [] };
  } else if (input.vehicle.year != null) {
    matchReasons.push(
      `Год входит в диапазон ${identity.yearFrom}–${identity.yearTo ?? "н.в."}`,
    );
  }

  if (input.vehicle.body) {
    const body = offer.sourceAttributes?.["Кузов"]?.[0];
    if (!body || !matchesBody(body, input.vehicle.body)) {
      return { matches: false, reason: "body", identity, matchReasons: [] };
    }
    matchReasons.push("Кузов совпал");
  }

  return { matches: true, identity, matchReasons };
}

export function formatMotorlandGeneration(
  identity: MotorlandProductIdentity,
): string {
  const code = identity.generation
    .replace(/-(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/, "")
    .replaceAll("-", " ")
    .toUpperCase();
  const years = identity.yearFrom
    ? `${identity.yearFrom}–${identity.yearTo ?? "н.в."}`
    : undefined;
  return [code, years].filter(Boolean).join(" · ");
}
