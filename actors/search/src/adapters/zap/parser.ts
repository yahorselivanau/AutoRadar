import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
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
  return exactLinkPath(
    $,
    ".carparts-category-cards__item[href], .cct-node__content[href]",
    partName,
    `${modelPath}/`,
  );
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
      if (!path || !title) return;

      offers.push(
        NormalizedOfferSchema.parse({
          sourceId: "zap",
          externalId:
            card.attr("data-key") ??
            `${brand ?? "unknown"}-${rawPartNumber ?? path}`,
          externalUrl: new URL(path, origin).toString(),
          title,
          description:
            cleanText(
              card
                .find(".td-col-info > .text-muted.mrgt10.small")
                .first()
                .text(),
            ) || undefined,
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
