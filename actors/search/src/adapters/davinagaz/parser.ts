import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
} from "@autoradar/domain";
import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import { AdapterError } from "../types";

const origin = "https://davinagaz.by";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeProductUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, origin);
    return url.protocol === "https:" &&
      url.hostname === "davinagaz.by" &&
      /^\/detail\/[^/]+\/[^/]+\/$/i.test(url.pathname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  try {
    const url = new URL(src, origin);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readAvailability(card: Cheerio<AnyNode>): string | undefined {
  const value = cleanText(
    card
      .find(".g-box")
      .first()
      .clone()
      .find(".for-mobile")
      .remove()
      .end()
      .text(),
  );
  return value || undefined;
}

function readDelivery(card: Cheerio<AnyNode>): string | undefined {
  const delivery = card.find(".g-delivery .d-center").first();
  const value = delivery
    .find("b, small")
    .map((_, element) => cleanText(delivery.find(element).text()))
    .get()
    .filter(Boolean)
    .join(" ");
  return value || undefined;
}

export function hashDavinagazPayload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function parseDavinagazSearchHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
  resultLimit = 30,
): NormalizedOffer[] {
  const $ = load(html);
  const cards = $(".ftr.element-for-filter");
  const rawPayloadHash = hashDavinagazPayload(html);
  const offers: NormalizedOffer[] = [];
  const seenIds = new Set<string>();

  cards.each((_, element) => {
    if (offers.length >= resultLimit) return;
    const card = $(element);
    const titleAnchor = card.find(".g-name a.g-descr-s[href]").first();
    const externalUrl = safeProductUrl(titleAnchor.attr("href"));
    const externalId = card
      .find(".btn-cart[id]")
      .first()
      .attr("id")
      ?.match(/^pre-(\d+)$/)?.[1];
    const title = cleanText(titleAnchor.text());
    const brand = cleanText(
      card.find(".g-descr-sup-brand a[data-brand]").first().attr("title") ?? "",
    );
    const rawPartNumber = cleanText(
      card.find(".g-article a.g-article[href]").first().text(),
    );
    const priceElement = card.find(".g-price-bigprice").first();
    const price = cleanText(priceElement.find("span").first().text());
    const currency = cleanText(priceElement.find("span").eq(1).text());
    if (
      !externalUrl ||
      !externalId ||
      !title ||
      !brand ||
      !rawPartNumber ||
      seenIds.has(externalId)
    ) {
      return;
    }
    seenIds.add(externalId);

    const packageElement = card.find(".g-price-complect").first();
    const packageText = packageElement
      .find("span")
      .map((_, element) => cleanText(packageElement.find(element).text()))
      .get()
      .filter(Boolean)
      .join(" ");
    const location = cleanText(
      card.find(".g-delivery .hot-offer-title").first().text(),
    );
    offers.push(
      NormalizedOfferSchema.parse({
        sourceId: "davinagaz",
        externalId,
        externalUrl,
        title,
        brand,
        rawPartNumber,
        normalizedPartNumber: normalizePartNumber(rawPartNumber),
        oemNumbers: [],
        condition: "unknown",
        partKind: "unknown",
        priceAmount:
          currency === "BYN" && /^\d+(?:\.\d{1,2})?$/.test(price)
            ? price
            : undefined,
        priceSource: currency === "BYN" ? "dom" : undefined,
        currency: "BYN",
        imageUrl: safeImageUrl(
          card.find(".image-wrap img[src]").first().attr("src"),
        ),
        availability: readAvailability(card),
        deliveryText: readDelivery(card),
        location: location || undefined,
        sellerName: "Davinagaz.by",
        sourceAttributes: packageText
          ? { "Упаковка Davinagaz": [packageText] }
          : undefined,
        fetchedAt,
        rawPayloadHash,
      }),
    );
  });

  if (cards.length > 0 && offers.length === 0) {
    throw new AdapterError(
      "davinagaz",
      "parse",
      "DOM_CHANGED: карточки Davinagaz.by не содержат обязательные id, ссылку, бренд и артикул",
    );
  }
  if (cards.length === 0 && $(".is-finder-proccess, .ws-process").length > 0) {
    throw new AdapterError(
      "davinagaz",
      "parse",
      "DYNAMIC_RESULTS: Davinagaz.by оставил выдачу на этапе загрузки складов",
    );
  }
  return offers;
}
