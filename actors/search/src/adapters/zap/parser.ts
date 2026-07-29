import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
  type PartConstraintKey,
  type PartRequest,
  type SearchRequest,
} from "@autoradar/domain";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

import { AdapterError } from "../types";

const origin = "https://zap.by";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function comparable(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

function comparableWords(value: string): string[] {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function searchablePlacementText(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ó", "o")
    .replaceAll("ł", "l")
    .replace(/\s+/g, " ");
}

export interface ZapPlacement {
  side: "left" | "right" | "unknown";
  position: "front" | "rear" | "unknown";
}

export function detectZapPlacement(value: string): ZapPlacement {
  const text = searchablePlacementText(value);
  const left = /\b(?:left|lh|lewy|lewa|lewe)\b|слева|лев(?:ый|ая|ое|ую)/i.test(
    text,
  );
  const right =
    /\b(?:right|rh|prawy|prawa|prawe)\b|справа|прав(?:ый|ая|ое|ую)/i.test(text);
  const front = /\bfront\b|спереди|передн(?:ий|яя|ее|юю)|\bprz[a-zа]*d\b/i.test(
    text,
  );
  const rear = /\brear\b|сзади|задн(?:ий|яя|ее|юю)|\btyl?\b/i.test(text);

  return {
    side: left === right ? "unknown" : left ? "left" : "right",
    position: front === rear ? "unknown" : front ? "front" : "rear",
  };
}

export function filterZapOffersByPlacement(
  offers: NormalizedOffer[],
  part: PartRequest,
): NormalizedOffer[] {
  if (part.side === "unknown" && part.position === "unknown") return offers;
  return offers.filter((offer) => {
    const detected = detectZapPlacement(
      `${offer.title} ${offer.description ?? ""}`,
    );
    return (
      (part.side === "unknown" || detected.side === part.side) &&
      (part.position === "unknown" || detected.position === part.position)
    );
  });
}

function safeZapPath(
  href: string | undefined,
  prefix?: string,
): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, origin);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "zap.by" ||
      url.search ||
      url.pathname.includes("/search") ||
      (prefix && !url.pathname.startsWith(prefix))
    ) {
      return undefined;
    }
    return url.pathname;
  } catch {
    return undefined;
  }
}

function exactLinkPath(
  $: CheerioAPI,
  selector: string,
  label: string,
  prefix: string,
): string | undefined {
  const target = comparable(label);
  return $(selector)
    .toArray()
    .map((node) => {
      const link = $(node);
      return {
        label: comparable(cleanText(link.text())),
        path: safeZapPath(link.attr("href"), prefix),
      };
    })
    .find((candidate) => candidate.label === target)?.path;
}

export function findZapMakePath(
  html: string,
  make: string,
): string | undefined {
  const $ = load(html);
  return exactLinkPath(
    $,
    ".dropdown.mrgb10 > a.btn-lg[href]",
    make,
    "/carparts/",
  );
}

export function findZapModelPath(
  html: string,
  makePath: string,
  model: string,
): string | undefined {
  const $ = load(html);
  return exactLinkPath($, "a.ajax[href]", model, `${makePath}/`);
}

export function findZapCategoryPath(
  html: string,
  modelPath: string,
  partName: string,
): string | undefined {
  const $ = load(html);
  const selector =
    ".carparts-category-cards__item[href], .cct-node__content[href]";
  const exact = exactLinkPath($, selector, partName, `${modelPath}/`);
  if (exact) return exact;

  const requested = new Set(comparableWords(partName));
  const candidates = $(selector)
    .toArray()
    .map((node) => {
      const link = $(node);
      const label = cleanText(link.text());
      const words = new Set(comparableWords(label));
      const intersection = [...requested].filter((word) => words.has(word));
      const union = new Set([...requested, ...words]);
      const path = safeZapPath(link.attr("href"), `${modelPath}/`);
      return {
        path,
        score: union.size > 0 ? intersection.length / union.size : 0,
      };
    })
    .filter((candidate) => candidate.path)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  return best && best.score >= 0.67 ? best.path : undefined;
}

export interface ZapVehicleVariant {
  id: string;
  label: string;
  yearFrom?: number;
  yearTo?: number;
}

function parseYearRange(value: string): {
  yearFrom?: number;
  yearTo?: number;
} {
  const years = value.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) ?? [];
  return {
    yearFrom: years[0],
    yearTo: years[1],
  };
}

export function parseZapVehicleVariants(html: string): ZapVehicleVariant[] {
  const $ = load(html);
  return $('a[data-item="model"][data-value]')
    .toArray()
    .map((node) => {
      const link = $(node);
      const id = link.attr("data-value");
      const label = cleanText(link.find(".font-14").first().text());
      const range = parseYearRange(
        cleanText(link.find(".small, small").first().text()),
      );
      return id && label ? { id, label, ...range } : undefined;
    })
    .filter((value): value is ZapVehicleVariant => Boolean(value));
}

export interface ZapEngineVariant extends ZapVehicleVariant {
  details?: string;
}

export function parseZapEngineVariants(html: string): ZapEngineVariant[] {
  const $ = load(html);
  return $('a[data-item="type"][data-value]')
    .toArray()
    .map((node) => {
      const link = $(node);
      const id = link.attr("data-value");
      const label = cleanText(link.find(".font-14").first().text());
      const details = cleanText(link.find(".text-muted").first().text());
      const range = parseYearRange(details);
      return id && label
        ? {
            id,
            label,
            ...(details ? { details } : {}),
            ...range,
          }
        : undefined;
    })
    .filter((value): value is ZapEngineVariant => Boolean(value));
}

function vehicleVariantScore(
  variant: ZapVehicleVariant,
  request: SearchRequest["vehicle"],
): number {
  if (!request) return -1;
  if (
    (variant.yearFrom && request.year < variant.yearFrom) ||
    (variant.yearTo && request.year > variant.yearTo)
  ) {
    return -1;
  }
  const requestedModel = comparableWords(request.model);
  const label = comparableWords(variant.label);
  if (!requestedModel.every((word) => label.includes(word))) return -1;
  let score = requestedModel.length * 10;
  const requestedQualifiers = [request.generation, request.body].flatMap(
    (value) => (value ? comparableWords(value) : []),
  );
  score +=
    requestedQualifiers.filter((word) => label.includes(word)).length * 8;
  const variantOnly = label.filter(
    (word) =>
      !requestedModel.includes(word) &&
      !/^(?:i|ii|iii|iv|v|vi|(?=[0-9a-z_]*[0-9_])[0-9a-z_]+)$/.test(word),
  );
  score -= variantOnly.length * 3;
  return score;
}

export function resolveZapVehicleVariants(
  variants: ZapVehicleVariant[],
  request: NonNullable<SearchRequest["vehicle"]>,
): ZapVehicleVariant[] {
  const scored = variants
    .map((variant) => ({
      variant,
      score: vehicleVariantScore(variant, request),
    }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0) return [];
  const first = scored[0];
  if (!first) return [];
  const best = first.score;
  return scored
    .filter(({ score }) => score === best)
    .map(({ variant }) => variant);
}

export function resolveZapEngineVariants(
  variants: ZapEngineVariant[],
  engine: string,
  year: number,
): ZapEngineVariant[] {
  const requested = comparableWords(engine);
  const scored = variants
    .filter(
      (variant) =>
        (!variant.yearFrom || year >= variant.yearFrom) &&
        (!variant.yearTo || year <= variant.yearTo),
    )
    .map((variant) => {
      const words = comparableWords(
        `${variant.label} ${variant.details ?? ""}`,
      );
      const matches = requested.filter((word) => words.includes(word)).length;
      return {
        variant,
        score: requested.length > 0 ? matches / requested.length : 0,
      };
    })
    .filter(({ score }) => score >= 0.6)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0) return [];
  const first = scored[0];
  if (!first) return [];
  const best = first.score;
  return scored
    .filter(({ score }) => score === best)
    .map(({ variant }) => variant);
}

export function parseZapCategoryId(html: string): string | undefined {
  return html.match(/\b(?:let|var|const)\s+section_id\s*=\s*["']?(\d+)/)?.[1];
}

export function parseZapChoiceUri(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("uri" in value) ||
    typeof value.uri !== "string"
  ) {
    return undefined;
  }
  return value.uri.replace(/^\/+|\/+$/g, "");
}

export function parseZapChoiceHtml(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("html" in value) ||
    typeof value.html !== "string"
  ) {
    return undefined;
  }
  return value.html;
}

export function hashZapPayload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

function imageUrl(card: Cheerio<AnyNode>): string | undefined {
  for (const node of card.find("img[data-src], img[src]").toArray()) {
    const image = card.find(node);
    const value = image.attr("data-src") ?? image.attr("src");
    if (!value || /placeholder|loader\.gif/i.test(value)) continue;
    try {
      const url = new URL(value, origin);
      if (url.protocol === "https:" && url.hostname.endsWith("zap.by")) {
        return url.toString();
      }
    } catch {
      // The next verified image candidate is tried.
    }
  }
  return undefined;
}

function removeLabel(value: string, label: string): string | undefined {
  const cleaned = cleanText(value).replace(
    new RegExp(`^${label}\\s*`, "i"),
    "",
  );
  return cleaned || undefined;
}

function catalogContext($: CheerioAPI): string | undefined {
  const crumbs = $(".breadcrumb li")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .filter(
      (value) =>
        value &&
        !["Главная", "Каталог", "Фильтры"].includes(value) &&
        !value.startsWith("Масляный фильтр"),
    );
  return crumbs.length > 0
    ? `Каталог Zap.by: ${crumbs.join(" · ")}`
    : undefined;
}

export function parseZapCatalogHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
  resultLimit = 50,
): NormalizedOffer[] {
  const $ = load(html);
  const rawPayloadHash = hashZapPayload(html);
  const compatibilityText = catalogContext($);
  const offers: NormalizedOffer[] = [];

  $(".product-block")
    .slice(0, resultLimit)
    .each((_, element) => {
      const card = $(element);
      const anchor = card.find("a.td-info-name[href]").first();
      const path = safeZapPath(anchor.attr("href"));
      const title = cleanText(anchor.text());
      const brand =
        cleanText(
          card.find(".td-info-name_inner").not(".altname").first().text(),
        ) || undefined;
      const rawPartNumber =
        card.find(".to-wishlist[data-article]").first().attr("data-article") ??
        card.find(".price-ws-all[data-artnum]").first().attr("data-artnum");
      const priceAmount = card.attr("data-price")?.match(/^\d+(?:\.\d{1,2})?$/)
        ? card.attr("data-price")
        : undefined;
      const description =
        cleanText(
          card.find(".td-col-info > .text-muted.mrgt10.small").first().text(),
        ) || undefined;
      if (!path || !title) return;

      offers.push(
        NormalizedOfferSchema.parse({
          sourceId: "zap",
          externalId:
            card.attr("data-key") ??
            `${brand ?? "unknown"}-${rawPartNumber ?? path}`,
          externalUrl: new URL(path, origin).toString(),
          title,
          description,
          brand,
          rawPartNumber,
          normalizedPartNumber: rawPartNumber
            ? normalizePartNumber(rawPartNumber)
            : undefined,
          oemNumbers: [],
          condition: "unknown",
          partKind: "unknown",
          priceAmount,
          priceSource: priceAmount ? "data_attribute" : undefined,
          currency: "BYN",
          imageUrl: imageUrl(card),
          availability: removeLabel(
            card.find(".avail").first().text(),
            "Наличие:",
          ),
          deliveryText: removeLabel(
            card.find(".td-delivery").first().text(),
            "Срок поставки:",
          ),
          sellerName: "Zap.by",
          compatibilityText,
          sourceAttributes: descriptionSourceAttributes(description),
          fetchedAt,
          rawPayloadHash,
        }),
      );
    });

  if ($(".product-block").length > 0 && offers.length === 0) {
    throw new AdapterError(
      "zap",
      "parse",
      "DOM_CHANGED: карточки Zap.by не содержат обязательные ссылку и название",
    );
  }
  return offers;
}

export function findZapSearchCandidatePaths(html: string): string[] {
  const $ = load(html);
  const paths = $("#content tr[data-key] a.btn[href], #content a[href]")
    .toArray()
    .map((node) => safeZapPath($(node).attr("href")))
    .filter(
      (path): path is string =>
        Boolean(path) &&
        /^\/[^/]+\/[^/]+$/.test(path ?? "") &&
        !path?.startsWith("/carparts/"),
    );
  return [...new Set(paths)];
}

function normalizeZapPrice(value: string): string | undefined {
  const match = cleanText(value)
    .replace(",", ".")
    .match(/\d+(?:\.\d{1,2})?/);
  return match?.[0];
}

const zapAttributeKeys: Array<{
  pattern: RegExp;
  key: PartConstraintKey;
}> = [
  { pattern: /место установки|сторона установки/i, key: "mounting" },
  { pattern: /ось/i, key: "axle" },
  { pattern: /вид эксплуатации|режим работы/i, key: "operation" },
  { pattern: /число дверей|количество дверей/i, key: "doorCount" },
  { pattern: /кузов/i, key: "body" },
  { pattern: /тормозн.*систем/i, key: "brakeSystem" },
  { pattern: /диаметр/i, key: "diameter" },
  { pattern: /длина/i, key: "length" },
  { pattern: /ширина/i, key: "width" },
  { pattern: /высота/i, key: "height" },
  { pattern: /резьб/i, key: "thread" },
  { pattern: /разъем|штекер|контакт/i, key: "connector" },
  { pattern: /цвет/i, key: "color" },
  { pattern: /материал/i, key: "material" },
];

function pushAttribute(
  attributes: Record<string, string[]>,
  key: string,
  value: string,
) {
  if (!value) return;
  const values = (attributes[key] ??= []);
  if (!values.includes(value)) values.push(value);
}

function descriptionSourceAttributes(
  description: string | undefined,
): Record<string, string[]> {
  const attributes: Record<string, string[]> = {};
  if (!description) return attributes;
  const placement = detectZapPlacement(description);
  if (placement.side !== "unknown" || placement.position !== "unknown") {
    pushAttribute(attributes, "mounting", description);
  }
  const doorMatch = description.match(/\b([235])\s*D\b/i);
  const doorValue = doorMatch?.[1];
  if (doorValue) pushAttribute(attributes, "doorCount", doorValue);
  if (/без\s+(?:электро)?мотора/i.test(description)) {
    pushAttribute(attributes, "motorIncluded", "false");
  } else if (/(?:с|включая)\s+(?:электро)?мотор/i.test(description)) {
    pushAttribute(attributes, "motorIncluded", "true");
  }
  return attributes;
}

function productSourceAttributes(
  $: CheerioAPI,
  description: string | undefined,
): Record<string, string[]> {
  const attributes = descriptionSourceAttributes(description);
  $(".td-feature-item").each((_, node) => {
    const item = $(node);
    const name = cleanText(item.find(".td-feature-item-name").text());
    const value = cleanText(item.find(".td-feature-item-value").text());
    if (!name || !value) return;
    pushAttribute(attributes, `zap:${name.toLocaleLowerCase("ru")}`, value);
    const canonical = zapAttributeKeys.find(({ pattern }) =>
      pattern.test(name),
    )?.key;
    if (canonical === "mounting") {
      attributes.mounting = [];
    }
    if (
      canonical &&
      !(canonical === "doorCount" && attributes.doorCount?.length)
    ) {
      pushAttribute(attributes, canonical, value);
    }
    if (/примечание/i.test(name)) {
      if (/без\s+(?:электро)?мотора/i.test(value)) {
        pushAttribute(attributes, "motorIncluded", "false");
      } else if (/(?:с|включая)\s+(?:электро)?мотор/i.test(value)) {
        pushAttribute(attributes, "motorIncluded", "true");
      }
    }
  });

  $("#tab-applicability [data-type='apps'][data-mod-id]").each((_, node) => {
    const button = $(node);
    const modelId = button.attr("data-mod-id");
    const label = cleanText(button.text());
    if (modelId) pushAttribute(attributes, "applicabilityModelId", modelId);
    if (label) pushAttribute(attributes, "applicabilityModel", label);
  });

  return attributes;
}

export function parseZapProductHtml(
  html: string,
  productPath: string,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const $ = load(html);
  const root = $("#part_info[data-key]").first();
  if (!root.length) return [];
  const path = safeZapPath(
    $('link[rel="canonical"]').attr("href") ?? productPath,
  );
  const title = cleanText($("h1").first().text());
  const rawPartNumber = root
    .find(".to-wishlist[data-article]")
    .attr("data-article");
  const brand = root.find(".to-wishlist[data-brand]").attr("data-brand");
  const domPrice = normalizeZapPrice(root.find(".font-38").first().text());
  const description =
    cleanText($("#tab-description [itemprop='description']").first().text()) ||
    undefined;
  const sourceAttributes = productSourceAttributes($, description);
  const oemNumbers = $("#tab-oems a[href^='oem/']")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .filter(Boolean);
  if (!path || !title) return [];

  return [
    NormalizedOfferSchema.parse({
      sourceId: "zap",
      externalId: root.attr("data-key") ?? path.replace(/^\/|\/$/g, ""),
      externalUrl: new URL(path, origin).toString(),
      title,
      description,
      brand: brand || undefined,
      rawPartNumber,
      normalizedPartNumber: rawPartNumber
        ? normalizePartNumber(rawPartNumber)
        : undefined,
      oemNumbers,
      condition: "unknown",
      partKind: "unknown",
      priceAmount: domPrice,
      priceSource: domPrice ? "dom" : undefined,
      currency: "BYN",
      imageUrl: imageUrl(root),
      sellerName: "Zap.by",
      compatibilityText: sourceAttributes.applicabilityModel?.join(" · "),
      sourceAttributes,
      fetchedAt,
      rawPayloadHash: hashZapPayload(html),
    }),
  ];
}
