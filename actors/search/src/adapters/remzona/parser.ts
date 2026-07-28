import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
} from "@autoradar/domain";
import { load } from "cheerio";

import { AdapterError } from "../types";

const origin = "https://remzona.by";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseBrandAndTitle(value: string): {
  brand?: string;
  title: string;
} {
  const [brandPart, descriptionPart] = value.split(/\s+\/\s+/, 2);
  return {
    brand: descriptionPart
      ? cleanText(brandPart ?? "") || undefined
      : undefined,
    title: cleanText(descriptionPart ?? value),
  };
}

export function hashRemzonaPayload(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function parseRemzonaSearchHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const $ = load(html);
  const rawPayloadHash = hashRemzonaPayload(html);
  const offers = new Map<string, NormalizedOffer>();

  $(".part-item a.part-content[href]").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    const values = anchor
      .find("[data-searchname]")
      .toArray()
      .map((node) => cleanText($(node).text()))
      .filter(Boolean);
    const rawPartNumber = values.at(0);
    const descriptiveValue = values.at(1);
    if (!href || !rawPartNumber || !descriptiveValue) return;

    let externalUrl: URL;
    try {
      externalUrl = new URL(href, origin);
    } catch {
      return;
    }
    if (
      externalUrl.protocol !== "https:" ||
      externalUrl.hostname !== "remzona.by"
    ) {
      return;
    }

    const { brand, title } = parseBrandAndTitle(descriptiveValue);
    const externalId = externalUrl.pathname.replace(/^\/|\/$/g, "");
    if (!externalId || !title) return;

    offers.set(
      externalUrl.toString(),
      NormalizedOfferSchema.parse({
        sourceId: "remzona",
        externalId,
        externalUrl: externalUrl.toString(),
        title,
        brand,
        rawPartNumber,
        normalizedPartNumber: normalizePartNumber(rawPartNumber),
        oemNumbers: [],
        condition: "unknown",
        partKind: "unknown",
        currency: "BYN",
        sellerName: "Remzona.by",
        fetchedAt,
        rawPayloadHash,
      }),
    );
  });

  if ($(".part-item").length > 0 && offers.size === 0) {
    throw new AdapterError(
      "remzona",
      "parse",
      "Карточки Remzona не содержат обязательные ссылку, название или артикул",
    );
  }

  return [...offers.values()];
}
