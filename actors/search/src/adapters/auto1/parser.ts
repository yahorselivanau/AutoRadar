import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
} from "@autoradar/domain";
import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import { AdapterError } from "../types";

const origin = "https://auto1.by";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeProductUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, origin);
    const isLocalizedProductPath =
      (/^\/details$/i.test(url.pathname) &&
        /^\d+$/.test(url.searchParams.get("id") ?? "")) ||
      /^\/(?:avtozapchasti|avtohimija-i-avtokosmetika|akkumulyatory|shiny-i-diski|masla-motornye-i-industrialnye|instrumenty|garazhnoe-oborudovanie|optika-i-detali-kuzova|aksessuary|krepesh-avtomobilnyj)\/.+\/\d+\/?$/i.test(
        url.pathname,
      );
    const isAllowedRootProductPath =
      /^\/(?:Parts|Tyres|Battery|Oil|Chemistry|Tools|GarageTools|CarBodyParts|Accessories|CarMount)\/.+\/\d+\/?$/i.test(
        url.pathname,
      );
    return url.protocol === "https:" &&
      url.hostname === "auto1.by" &&
      (isLocalizedProductPath || isAllowedRootProductPath)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function readTitleParts(anchor: Cheerio<AnyNode>): {
  title: string;
  brand?: string;
  rawPartNumber?: string;
} {
  const lines = anchor
    .contents()
    .filter((_, node) => node.type === "text")
    .map((_, node) => cleanText(node.data ?? ""))
    .get()
    .filter(Boolean);
  const title = cleanText(anchor.text());
  const productText = lines.length >= 2 ? lines.slice(1).join(" ") : title;
  const partNumberMatch = productText.match(
    /\b(?:[A-ZА-Я]*\d[A-ZА-Я0-9./_-]*|[0-9][A-ZА-Я0-9./_-]*)\b/i,
  );
  const rawPartNumber = partNumberMatch?.[0];
  const inferredBrand =
    partNumberMatch && partNumberMatch.index !== undefined
      ? cleanText(productText.slice(0, partNumberMatch.index))
      : "";
  const brand = (lines.length >= 2 ? lines[0] : inferredBrand) || undefined;
  return { title, brand, rawPartNumber };
}

function readDescription(card: Cheerio<AnyNode>): string | undefined {
  const values = card
    .find(".product-description li")
    .map((_, element) => cleanText(card.find(element).text()))
    .get()
    .filter(Boolean);
  return values.length > 0 ? values.join(" · ") : undefined;
}

function readAvailability(card: Cheerio<AnyNode>): string | undefined {
  const schemaValue = card.find('[itemprop="availability"]').attr("href");
  const stockQuantity = card
    .find("td")
    .map((_, element) => cleanText(card.find(element).text()))
    .get()
    .find((value) => /^(?:[<>]\s*)?\d+\s*(?:шт|к-?т)\.?$/i.test(value));
  if (schemaValue?.endsWith("/InStock")) {
    return stockQuantity ? `В наличии · ${stockQuantity}` : "В наличии";
  }
  if (schemaValue?.endsWith("/OutOfStock")) return "Нет в наличии";
  const visible = card
    .find("td")
    .map((_, element) => cleanText(card.find(element).text()))
    .get()
    .find((value) => /^(?:в наличии|под заказ|нет в наличии)$/i.test(value));
  return visible || undefined;
}

function readLocation(card: Cheerio<AnyNode>): string | undefined {
  const locality = card
    .find('[itemprop="addressLocality"]')
    .first()
    .attr("content");
  const street = card
    .find('[itemprop="streetAddress"]')
    .first()
    .attr("content");
  const value = [locality, street].filter(Boolean).join(", ");
  return value || undefined;
}

function readCondition(card: Cheerio<AnyNode>): "new" | "unknown" {
  return card
    .find('[itemprop="itemCondition"]')
    .attr("href")
    ?.endsWith("/NewCondition")
    ? "new"
    : "unknown";
}

export function hashAuto1Payload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function parseAuto1SearchHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
  resultLimit = 30,
): NormalizedOffer[] {
  const $ = load(html);
  const rawPayloadHash = hashAuto1Payload(html);
  const cards = $(".catalog-list > .catalog-list-card");
  const offers: NormalizedOffer[] = [];
  const seenUrls = new Set<string>();

  cards.each((_, element) => {
    if (offers.length >= resultLimit) return;
    const card = $(element);
    const anchor = card.find("a.link-name[href]").first();
    const externalUrl = safeProductUrl(
      anchor.attr("href") ??
        card.find('[itemprop="offers"] [itemprop="url"]').attr("href"),
    );
    const externalId =
      card.find("[data-articleid]").first().attr("data-articleid") ??
      externalUrl?.match(/(?:\/|[?&]id=)(\d+)\/?$/)?.[1];
    const { title, brand, rawPartNumber } = readTitleParts(anchor);
    if (!externalUrl || !externalId || !title || seenUrls.has(externalUrl)) {
      return;
    }
    seenUrls.add(externalUrl);

    const price = card
      .find('[itemprop="offers"] [itemprop="price"]')
      .first()
      .attr("content");
    const currency = card
      .find('[itemprop="offers"] [itemprop="priceCurrency"]')
      .first()
      .attr("content");
    const sellerName =
      card
        .find('[itemprop="seller"] [itemprop="name"]')
        .first()
        .attr("content") || "Auto1.by";

    offers.push(
      NormalizedOfferSchema.parse({
        sourceId: "auto1",
        externalId,
        externalUrl,
        title,
        description: readDescription(card),
        brand,
        rawPartNumber,
        normalizedPartNumber: rawPartNumber
          ? normalizePartNumber(rawPartNumber)
          : undefined,
        oemNumbers: [],
        condition: readCondition(card),
        partKind: "unknown",
        priceAmount:
          currency === "BYN" && price && /^\d+(?:\.\d{1,2})?$/.test(price)
            ? price
            : undefined,
        priceSource: currency === "BYN" && price ? "microdata" : undefined,
        currency: "BYN",
        availability: readAvailability(card),
        location: readLocation(card),
        sellerName,
        fetchedAt,
        rawPayloadHash,
      }),
    );
  });

  if (cards.length > 0 && offers.length === 0) {
    throw new AdapterError(
      "auto1",
      "parse",
      "DOM_CHANGED: карточки Auto1.by не содержат обязательные id, ссылку и название",
    );
  }
  return offers;
}
