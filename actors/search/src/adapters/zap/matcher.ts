import {
  NormalizedOfferSchema,
  type NormalizedOffer,
  type PartConstraint,
  type PartConstraintKey,
  type SearchClarification,
  type SearchRequest,
} from "@autoradar/domain";

import { detectZapPlacement } from "./parser";

interface EvaluatedOffer {
  offer: NormalizedOffer;
  rejected: boolean;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[.,]/g, ".")
    .replace(/[^a-zа-я0-9.]+/gi, " ")
    .trim();
}

function words(value: string): string[] {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function sameWords(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const remaining = [...right];
  return left.every((word) => {
    const index = remaining.indexOf(word);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

function stripLeadingArticle(
  title: string[],
  rawPartNumber: string | undefined,
): void {
  const article = normalize(rawPartNumber ?? "").replace(/[^a-zа-я0-9]/gi, "");
  if (!article) return;

  let joined = "";
  let consumed = 0;
  while (consumed < title.length && article.startsWith(joined)) {
    joined += title[consumed] ?? "";
    consumed += 1;
    if (joined === article) {
      title.splice(0, consumed);
      return;
    }
    if (!article.startsWith(joined)) return;
  }
}

export function matchesZapPartIdentity(
  offer: NormalizedOffer,
  input: SearchRequest,
): boolean {
  const requested = words(input.part.name);
  if (requested.length === 0) return false;

  const title = words(offer.title);
  const brand = words(offer.brand ?? "");
  if (sameWords(title.slice(0, brand.length), brand)) {
    title.splice(0, brand.length);
  }
  stripLeadingArticle(title, offer.rawPartNumber ?? offer.normalizedPartNumber);
  return sameWords(title.slice(0, requested.length), requested);
}

function valuesFor(offer: NormalizedOffer, key: string): string[] {
  return offer.sourceAttributes?.[key] ?? [];
}

function requestedConstraint(
  input: SearchRequest,
  key: PartConstraintKey,
): PartConstraint | undefined {
  return input.part.constraints.find((constraint) => constraint.key === key);
}

function comparableBoolean(value: string): string {
  const normalized = normalize(value);
  if (/^(?:true|да|есть|с мотором|включен)$/.test(normalized)) return "true";
  if (/^(?:false|нет|без мотора|не включен)$/.test(normalized)) return "false";
  return normalized;
}

function matchesValue(
  key: PartConstraintKey,
  requested: string,
  actual: string,
): boolean {
  if (key === "motorIncluded") {
    return comparableBoolean(requested) === comparableBoolean(actual);
  }
  const left = normalize(requested);
  const right = normalize(actual);
  return left === right || left.includes(right) || right.includes(left);
}

function appendReason(reasons: string[], value: string) {
  if (!reasons.includes(value)) reasons.push(value);
}

export function evaluateZapOffers(
  offers: NormalizedOffer[],
  input: SearchRequest,
  vehicleModelId?: string,
  vehicleTypeId?: string,
): NormalizedOffer[] {
  return offers
    .map((offer): EvaluatedOffer => {
      const reasons: string[] = [];
      let rejected = !matchesZapPartIdentity(offer, input);
      let missingEvidence = false;
      if (!rejected) {
        appendReason(reasons, "Название детали совпало с запросом");
      }
      if (input.vehicle && !vehicleModelId) {
        missingEvidence = true;
      }
      const placement = detectZapPlacement(
        [
          ...(offer.sourceAttributes?.mounting ?? []),
          offer.title,
          offer.description ?? "",
        ].join(" "),
      );

      if (input.part.side !== "unknown") {
        if (placement.side === "unknown") {
          missingEvidence = true;
        } else if (placement.side !== input.part.side) {
          rejected = true;
        } else {
          appendReason(reasons, "Сторона установки подтверждена Zap.by");
        }
      }

      if (input.part.position !== "unknown") {
        if (placement.position === "unknown") {
          missingEvidence = true;
        } else if (placement.position !== input.part.position) {
          rejected = true;
        } else {
          appendReason(reasons, "Положение детали подтверждено Zap.by");
        }
      }

      if (vehicleModelId) {
        const applicableModels = valuesFor(offer, "applicabilityModelId");
        if (applicableModels.length === 0) {
          missingEvidence = true;
        } else if (!applicableModels.includes(vehicleModelId)) {
          rejected = true;
        } else {
          appendReason(reasons, "Поколение автомобиля есть в применимости");
        }
      }

      if (input.vehicle?.engine && !vehicleTypeId) {
        missingEvidence = true;
      } else if (input.vehicle?.engine && vehicleTypeId) {
        const catalogVehicleTypes = valuesFor(offer, "catalogVehicleTypeId");
        if (catalogVehicleTypes.length === 0) {
          missingEvidence = true;
        } else if (!catalogVehicleTypes.includes(vehicleTypeId)) {
          rejected = true;
        } else {
          appendReason(reasons, "Модификация двигателя выбрана в каталоге");
        }
      }

      const requestedDoors =
        (input.vehicle?.doors ??
          Number(requestedConstraint(input, "doorCount")?.value || 0)) ||
        undefined;
      if (requestedDoors) {
        const actualDoors = valuesFor(offer, "doorCount").map(Number);
        if (actualDoors.length === 0) {
          missingEvidence = true;
        } else if (!actualDoors.includes(requestedDoors)) {
          rejected = true;
        } else {
          appendReason(reasons, `Вариант для ${requestedDoors} дверей`);
        }
      }

      for (const constraint of input.part.constraints) {
        if (constraint.key === "doorCount") continue;
        const actualValues = valuesFor(offer, constraint.key);
        if (actualValues.length === 0) {
          missingEvidence = true;
          continue;
        }
        if (
          !actualValues.some((actual) =>
            matchesValue(constraint.key, constraint.value, actual),
          )
        ) {
          rejected = true;
        } else {
          appendReason(
            reasons,
            `${constraint.key}: ${constraint.value} подтверждено`,
          );
        }
      }

      return {
        rejected,
        offer: NormalizedOfferSchema.parse({
          ...offer,
          matchStatus: missingEvidence ? "possible" : "confirmed",
          matchReasons: reasons,
        }),
      };
    })
    .filter(({ rejected }) => !rejected)
    .map(({ offer }) => offer)
    .sort((left, right) =>
      left.matchStatus === right.matchStatus
        ? 0
        : left.matchStatus === "confirmed"
          ? -1
          : 1,
    );
}

function distinctAttributeValues(
  offers: NormalizedOffer[],
  key: PartConstraintKey,
): string[] {
  return [
    ...new Set(offers.flatMap((offer) => offer.sourceAttributes?.[key] ?? [])),
  ].sort();
}

function readableBoolean(value: string): string {
  return comparableBoolean(value) === "true" ? "С мотором" : "Без мотора";
}

export function findZapOfferClarification(
  offers: NormalizedOffer[],
  input: SearchRequest,
): SearchClarification | undefined {
  if (!input.vehicle?.doors && !requestedConstraint(input, "doorCount")) {
    const doors = distinctAttributeValues(offers, "doorCount").filter((value) =>
      /^[2-6]$/.test(value),
    );
    if (doors.length > 1) {
      return {
        id: "zap-door-count",
        field: "doors",
        question: "Сколько дверей у автомобиля?",
        options: doors.map((value) => ({
          id: `doors-${value}`,
          label: `${value} дверей`,
          value: Number(value),
        })),
      };
    }
  }

  if (!requestedConstraint(input, "motorIncluded")) {
    const values = distinctAttributeValues(offers, "motorIncluded").filter(
      (value) => value === "true" || value === "false",
    );
    if (values.length > 1) {
      return {
        id: "zap-motor-included",
        field: "part_attribute",
        attributeKey: "motorIncluded",
        question: "Нужна деталь с электромотором или без него?",
        options: values.map((value) => ({
          id: `motor-${value}`,
          label: readableBoolean(value),
          value,
        })),
      };
    }
  }

  if (!requestedConstraint(input, "operation")) {
    const values = distinctAttributeValues(offers, "operation");
    if (values.length > 1 && values.length <= 4) {
      return {
        id: "zap-operation",
        field: "part_attribute",
        attributeKey: "operation",
        question: "Какой вариант исполнения нужен?",
        options: values.map((value) => ({
          id: `operation-${normalize(value)}`,
          label: value,
          value,
        })),
      };
    }
  }

  return undefined;
}
