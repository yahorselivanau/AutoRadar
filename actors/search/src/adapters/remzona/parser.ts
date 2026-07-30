import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
  type SearchRequest,
} from "@autoradar/domain";
import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import { AdapterError } from "../types";

const origin = "https://remzona.by";
const priceSources = ["json_ld", "microdata", "data_attribute", "dom"] as const;

export type RemzonaPriceSource = (typeof priceSources)[number] | "api";

export interface RemzonaSearchCandidate {
  kind: "category" | "product";
  title: string;
  path: string;
  rawPartNumber?: string;
  normalizedPartNumber?: string;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function comparable(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/[^a-zа-яё0-9]+/gi, "");
}

function safePath(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, origin);
    return url.protocol === "https:" && url.hostname === "remzona.by"
      ? `${url.pathname}${url.search}`
      : undefined;
  } catch {
    return undefined;
  }
}

export function hashRemzonaPayload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function normalizeRemzonaPrice(value: string): string | undefined {
  const match = value
    .replace(/\u00a0/g, " ")
    .match(/(\d[\d\s]*)(?:[,.](\d{1,2}))?/);
  if (!match?.[1]) return undefined;
  const integer = match[1].replace(/\s/g, "");
  const fraction = match[2];
  return fraction ? `${integer}.${fraction.padEnd(2, "0")}` : integer;
}

function jsonLdPrice(root: Cheerio<AnyNode>): string | undefined {
  for (const script of root
    .find('script[type="application/ld+json"]')
    .toArray()) {
    try {
      const payload: unknown = JSON.parse(root.find(script).text());
      const queue: unknown[] = [payload];
      while (queue.length > 0) {
        const value = queue.shift();
        if (Array.isArray(value)) {
          queue.push(...value);
          continue;
        }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        const currency = record.priceCurrency;
        const rawPrice = record.price ?? record.lowPrice;
        if (
          (currency === undefined || currency === "BYN") &&
          (typeof rawPrice === "string" || typeof rawPrice === "number")
        ) {
          const normalized = normalizeRemzonaPrice(String(rawPrice));
          if (normalized) return normalized;
        }
        queue.push(...Object.values(record));
      }
    } catch {
      // Invalid JSON-LD is ignored; the next verified price source is tried.
    }
  }
  return undefined;
}

function extractPrice(
  root: Cheerio<AnyNode>,
): { amount: string; source: RemzonaPriceSource } | undefined {
  const jsonLd = jsonLdPrice(root);
  if (jsonLd) return { amount: jsonLd, source: "json_ld" };

  const microdata = root
    .find('[itemprop="price"][content]')
    .first()
    .attr("content");
  const normalizedMicrodata = microdata
    ? normalizeRemzonaPrice(microdata)
    : undefined;
  if (normalizedMicrodata) {
    return { amount: normalizedMicrodata, source: "microdata" };
  }

  const meta = root
    .find('meta[property="product:price:amount"][content]')
    .first()
    .attr("content");
  const normalizedMeta = meta ? normalizeRemzonaPrice(meta) : undefined;
  if (normalizedMeta) {
    return { amount: normalizedMeta, source: "microdata" };
  }

  const dataPrice = root.find("[data-price], [data-cost]").first();
  const rawDataPrice =
    dataPrice.attr("data-price") ?? dataPrice.attr("data-cost");
  const normalizedDataPrice = rawDataPrice
    ? normalizeRemzonaPrice(rawDataPrice)
    : undefined;
  if (normalizedDataPrice) {
    return { amount: normalizedDataPrice, source: "data_attribute" };
  }

  const domPrice = cleanText(
    root
      .find('.value_price [data-cur="BYN"], [data-cur="BYN"].value_price')
      .first()
      .text(),
  );
  const normalizedDomPrice = normalizeRemzonaPrice(domPrice);
  if (normalizedDomPrice) {
    return { amount: normalizedDomPrice, source: "dom" };
  }

  const textPrice = cleanText(root.text()).match(
    /\d[\d\s]*(?:[,.]\d{1,2})?\s*(?:BYN|руб(?:\.|ля|лей)?)/i,
  )?.[0];
  const normalizedTextPrice = textPrice
    ? normalizeRemzonaPrice(textPrice)
    : undefined;
  return normalizedTextPrice
    ? { amount: normalizedTextPrice, source: "dom" }
    : undefined;
}

function absoluteRemzonaUrl(path: string): string {
  return new URL(path, origin).toString();
}

function readNamedParameter(
  root: Cheerio<AnyNode>,
  label: string,
): string | undefined {
  for (const row of root.find(".part-param").toArray()) {
    const item = root.find(row);
    if (cleanText(item.find(".name-param").text()) === label) {
      return cleanText(item.find(".value-param").text()) || undefined;
    }
  }
  return undefined;
}

function readDescription(root: Cheerio<AnyNode>): string | undefined {
  const values = [
    cleanText(root.find("p .line3").first().text()),
    ...root
      .find(".rowfilter")
      .toArray()
      .map((row) => cleanText(root.find(row).text())),
  ].filter(Boolean);
  return values.length > 0 ? values.join(" · ") : undefined;
}

export function parseRemzonaCatalogHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const $ = load(html);
  const rawPayloadHash = hashRemzonaPayload(html);
  const offers: NormalizedOffer[] = [];

  $(".box-articleitems > .item-list").each((_, element) => {
    const card = $(element);
    const anchor = card.find("a.name-art[href]").first();
    const path = safePath(anchor.attr("href"));
    const title = cleanText(anchor.text());
    if (!path || !title) return;

    const price = extractPrice(card);
    const externalId =
      card.find("[data-art_id]").first().attr("data-art_id") ??
      path.replace(/^\/|\/$/g, "");
    const imagePath =
      card.find("img[data-src]").first().attr("data-src") ??
      card.find("img[src]").first().attr("src");
    const imageUrl = imagePath
      ? new URL(imagePath, origin).toString()
      : undefined;

    offers.push(
      NormalizedOfferSchema.parse({
        sourceId: "remzona",
        externalId,
        externalUrl: absoluteRemzonaUrl(path),
        title,
        description: readDescription(card),
        oemNumbers: [],
        condition: "unknown",
        partKind: "unknown",
        priceAmount: price?.amount,
        priceSource: price?.source,
        currency: "BYN",
        imageUrl,
        availability: readNamedParameter(card, "Доступно"),
        deliveryText: readNamedParameter(card, "Доставка"),
        sellerName: "Remzona.by",
        fetchedAt,
        rawPayloadHash,
      }),
    );
  });

  if ($(".box-articleitems > .item-list").length > 0 && offers.length === 0) {
    throw new AdapterError(
      "remzona",
      "parse",
      "DOM_CHANGED: карточки Remzona не содержат обязательные ссылку и название",
    );
  }
  return offers;
}

export function parseRemzonaProductHtml(
  html: string,
  productPath: string,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const $ = load(html);
  const root = $.root();
  const title = cleanText($("h1").first().text());
  const path = safePath($('link[rel="canonical"]').attr("href") ?? productPath);
  if (!title || !path) return [];
  const price = extractPrice(root);
  const imagePath =
    $('meta[property="og:image"]').attr("content") ??
    $("main img[data-src], main img[src]").first().attr("data-src") ??
    $("main img[src]").first().attr("src");

  return [
    NormalizedOfferSchema.parse({
      sourceId: "remzona",
      externalId: path.replace(/^\/|\/$/g, ""),
      externalUrl: absoluteRemzonaUrl(path),
      title,
      oemNumbers: [],
      condition: "unknown",
      partKind: "unknown",
      priceAmount: price?.amount,
      priceSource: price?.source,
      currency: "BYN",
      imageUrl: imagePath ? new URL(imagePath, origin).toString() : undefined,
      sellerName: "Remzona.by",
      fetchedAt,
      rawPayloadHash: hashRemzonaPayload(html),
    }),
  ];
}

export function parseRemzonaSearchCandidates(
  html: string,
): RemzonaSearchCandidate[] {
  const $ = load(html);
  const candidates: RemzonaSearchCandidate[] = [];
  $(".part-result[data-part] a.part-content[href]").each((_, element) => {
    const anchor = $(element);
    const path = safePath(anchor.attr("href"));
    const section = anchor.closest(".part-result").attr("data-part");
    const title = cleanText(
      anchor.attr("data-search-enter") ??
        anchor.find("[data-searchname]").first().text(),
    );
    if (!path || !title || !["group", "article"].includes(section ?? ""))
      return;
    candidates.push({
      kind: section === "group" ? "category" : "product",
      title,
      path,
      ...(section === "article" && anchor.attr("data-choose")?.trim()
        ? {
            rawPartNumber: anchor.attr("data-choose")!.trim(),
            normalizedPartNumber: normalizePartNumber(
              anchor.attr("data-choose")!,
            ),
          }
        : {}),
    });
  });
  return candidates;
}

export function chooseRemzonaCandidate(
  candidates: RemzonaSearchCandidate[],
  query: string,
  preferredKind?: RemzonaSearchCandidate["kind"],
): RemzonaSearchCandidate | undefined {
  const target = comparable(query);
  const eligible = preferredKind
    ? candidates.filter((candidate) => candidate.kind === preferredKind)
    : candidates;
  const exactArticle = eligible.find(
    (candidate) =>
      candidate.kind === "product" &&
      candidate.normalizedPartNumber === normalizePartNumber(query),
  );
  return (
    exactArticle ??
    eligible.find(
      (candidate) =>
        candidate.kind === "category" && comparable(candidate.title) === target,
    ) ??
    eligible.find(
      (candidate) =>
        candidate.kind === "product" && comparable(candidate.title) === target,
    ) ??
    (preferredKind
      ? undefined
      : (eligible.find((candidate) => candidate.kind === "category") ??
        eligible.find((candidate) => candidate.kind === "product")))
  );
}

export function findRemzonaMakeCatalogPath(
  html: string,
  categoryPath: string,
  make: string,
): string | undefined {
  const $ = load(html);
  const categorySlug = categoryPath.split("/").filter(Boolean).at(-1);
  if (!categorySlug) return undefined;
  const target = comparable(make);
  return $("a[href]")
    .toArray()
    .map((node) => ({
      path: safePath($(node).attr("href")),
      label: comparable($(node).text()),
    }))
    .find(
      ({ path, label }) =>
        label === target &&
        new RegExp(`^/catalog/[^/]+/${categorySlug}$`).test(path ?? ""),
    )?.path;
}

export function findRemzonaModelCatalogPath(
  html: string,
  makePath: string,
  model: string,
): string | undefined {
  const $ = load(html);
  const [catalog, makeSlug, categorySlug] = makePath.split("/").filter(Boolean);
  if (catalog !== "catalog" || !makeSlug || !categorySlug) return undefined;
  const target = comparable(model);
  return $("a[href]")
    .toArray()
    .map((node) => ({
      path: safePath($(node).attr("href")),
      label: comparable($(node).text()),
    }))
    .find(
      ({ path, label }) =>
        label.startsWith(target) &&
        new RegExp(`^/catalog/${makeSlug}/[^/]+/${categorySlug}$`).test(
          path ?? "",
        ),
    )?.path;
}

export function filterRemzonaOffersByPlacement(
  offers: NormalizedOffer[],
  part: SearchRequest["part"],
): NormalizedOffer[] {
  if (part.side === "unknown" && part.position === "unknown") return offers;
  return offers.filter((offer) => {
    const text = `${offer.title} ${offer.description ?? ""}`.toLocaleLowerCase(
      "ru",
    );
    const sideMatches =
      part.side === "unknown" ||
      (part.side === "left"
        ? /слева|лев(ый|ая|ое)|\bleft\b/.test(text)
        : /справа|прав(ый|ая|ое)|\bright\b/.test(text));
    const positionMatches =
      part.position === "unknown" ||
      (part.position === "front"
        ? /спереди|передн(ий|яя|ее)|\bfront\b/.test(text)
        : /сзади|задн(ий|яя|ее)|\brear\b/.test(text));
    return sideMatches && positionMatches;
  });
}

// Kept for the verified suggestion-only HTTP mode.
export function parseRemzonaSearchHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const rawPayloadHash = hashRemzonaPayload(html);
  return parseRemzonaSearchCandidates(html)
    .filter((candidate) => candidate.kind === "product")
    .map((candidate) =>
      NormalizedOfferSchema.parse({
        sourceId: "remzona",
        externalId: candidate.path.replace(/^\/|\/$/g, ""),
        externalUrl: absoluteRemzonaUrl(candidate.path),
        title: candidate.title,
        oemNumbers: [],
        condition: "unknown",
        partKind: "unknown",
        currency: "BYN",
        sellerName: "Remzona.by",
        fetchedAt,
        rawPayloadHash,
      }),
    );
}
