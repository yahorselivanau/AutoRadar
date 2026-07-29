import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
} from "@autoradar/domain";
import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import { AdapterError } from "../types";

const origin = "https://motorland.by";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function comparableMotorlandText(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

function safeProductUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, origin);
    return url.protocol === "https:" &&
      url.hostname === "motorland.by" &&
      /^\/auto-parts\/.+\/sku-\d+\/$/.test(url.pathname)
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
    return url.protocol === "https:" &&
      ["motorland.by", "media.motorland.by"].includes(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeMotorlandPrice(value: string): string | undefined {
  const match = value
    .replace(/\u00a0/g, " ")
    .match(/(\d[\d\s]*)(?:[,.](\d{1,3}))?/);
  if (!match?.[1]) return undefined;
  const integer = match[1].replace(/\s/g, "");
  const rawFraction = match[2];
  if (rawFraction && /[1-9]/.test(rawFraction.slice(2))) return undefined;
  const fraction = rawFraction?.slice(0, 2).padEnd(2, "0");
  return fraction && fraction !== "00" ? `${integer}.${fraction}` : integer;
}

function readCharacteristics(
  card: Cheerio<AnyNode>,
): Record<string, string[]> | undefined {
  const attributes: Record<string, string[]> = {};
  card.find(".item-characteristics tr").each((_, row) => {
    const label = cleanText(card.find(row).find("th").first().text()).replace(
      /:$/,
      "",
    );
    const value = cleanText(card.find(row).find("td").first().text());
    if (label && value) attributes[label] = [value];
  });
  const category = cleanText(
    card.attr("data-gtm-ecomerce-item-category2") ?? "",
  );
  if (category) attributes["Категория Motorland"] = [category];
  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function readDescription(
  attributes: Record<string, string[]> | undefined,
): string | undefined {
  return attributes?.["Описание"]?.[0];
}

function readCompatibility(
  attributes: Record<string, string[]> | undefined,
): string | undefined {
  if (!attributes) return undefined;
  const values = ["Год", "Кузов", "КПП", "Маркировка"]
    .flatMap((key) => attributes[key] ?? [])
    .filter(Boolean);
  return values.length > 0
    ? `Автомобиль-донор: ${values.join(" · ")}`
    : undefined;
}

function isUsedPartsPage(html: string): boolean {
  const $ = load(html);
  const metadata = [
    $("title").text(),
    $('meta[name="Description"]').attr("content") ?? "",
    $('meta[property="og:description"]').attr("content") ?? "",
  ].join(" ");
  return /(?:^|[^а-я])б\/?у(?:[^а-я]|$)|бывш\w*\s+в\s+употреблен/i.test(
    metadata,
  );
}

export function hashMotorlandPayload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function parseMotorlandSearchHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
  resultLimit = 30,
): NormalizedOffer[] {
  const $ = load(html);
  const rawPayloadHash = hashMotorlandPayload(html);
  const condition = isUsedPartsPage(html) ? "used" : "unknown";
  const offers: NormalizedOffer[] = [];
  const seenUrls = new Set<string>();

  $(".grid-new > .new-grid__item").each((_, element) => {
    if (offers.length >= resultLimit) return;
    const card = $(element);
    const anchor = card.find(".item-title a[href]").first();
    const externalUrl = safeProductUrl(anchor.attr("href"));
    const title =
      cleanText(anchor.text()) ||
      cleanText(card.attr("data-gtm-ecomerce-item-name") ?? "");
    const externalId =
      card.attr("data-gtm-ecomerce-item-id") ??
      externalUrl?.match(/sku-(\d+)/)?.[1];
    if (!externalUrl || !externalId || !title || seenUrls.has(externalUrl)) {
      return;
    }
    seenUrls.add(externalUrl);

    const rawPartNumber = cleanText(card.find(".item-article").text()).match(
      /Артикул товара:\s*([A-ZА-Я0-9./_-]+)/i,
    )?.[1];
    const price =
      normalizeMotorlandPrice(
        card.attr("data-gtm-ecomerce-item-price") ?? "",
      ) ??
      normalizeMotorlandPrice(
        cleanText(
          card.find(".item-price .prices-not_checkbox > span").first().text(),
        ),
      );
    const attributes = readCharacteristics(card);
    const deliveryText = cleanText(card.find(".item-garant").text()).includes(
      "Доставка по РБ",
    )
      ? "Доставка по РБ"
      : undefined;

    offers.push(
      NormalizedOfferSchema.parse({
        sourceId: "motorland",
        externalId,
        externalUrl,
        title,
        description: readDescription(attributes),
        brand:
          cleanText(card.attr("data-gtm-ecomerce-item-brand") ?? "") ||
          undefined,
        rawPartNumber,
        normalizedPartNumber: rawPartNumber
          ? normalizePartNumber(rawPartNumber)
          : undefined,
        oemNumbers: [],
        condition,
        partKind: "unknown",
        priceAmount: price,
        priceSource: price ? "data_attribute" : undefined,
        currency: "BYN",
        imageUrl: safeImageUrl(
          card.find(".present_car_img img[src]").first().attr("src"),
        ),
        deliveryText,
        sellerName: "Motorland.by",
        compatibilityText: readCompatibility(attributes),
        sourceAttributes: attributes,
        fetchedAt,
        rawPayloadHash,
      }),
    );
  });

  if ($(".grid-new > .new-grid__item").length > 0 && offers.length === 0) {
    throw new AdapterError(
      "motorland",
      "parse",
      "DOM_CHANGED: карточки Motorland не содержат обязательные id, ссылку и название",
    );
  }
  return offers;
}
