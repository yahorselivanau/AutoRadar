import { createHash } from "node:crypto";

import {
  NormalizedOfferSchema,
  normalizePartNumber,
  type NormalizedOffer,
} from "@autoradar/domain";
import { z } from "zod";

import { AdapterError } from "../types";

const ArmtekSuggestionSchema = z
  .object({
    PARNR: z.union([z.string(), z.number()]).optional(),
    PRICES1: z.string().optional(),
    RVALUE: z.union([z.string(), z.number()]).optional(),
    DLVDT: z.string().optional(),
    WAERS: z.string().optional(),
    KEYZAK: z.string().optional(),
    VENSL: z.union([z.string(), z.number()]).optional(),
    NAME: z.string().optional(),
  })
  .passthrough();

const ArmtekArticleSchema = z
  .object({
    ARTID: z.coerce.number().int().positive(),
    PIN: z.string().trim().min(1),
    BRAND: z.string().trim().min(1),
    NAME: z.string().trim().min(1),
    ARTICLE_ALIAS: z.string().trim().min(1),
    PHOTO: z.array(z.string()).default([]),
    SUGGESTIONS: z.array(ArmtekSuggestionSchema).default([]),
  })
  .passthrough();

const ArmtekSearchResponseSchema = z
  .object({
    data: z.object({
      articlesData: z.array(ArmtekArticleSchema),
      pagination: z
        .object({
          currentPage: z.number().int().nonnegative(),
          totalCount: z.number().int().nonnegative(),
        })
        .passthrough(),
    }),
    arr_messages: z.array(z.unknown()).default([]),
  })
  .passthrough();

function safeProductUrl(alias: string): string | undefined {
  if (!/^[a-z0-9-]+$/i.test(alias)) return undefined;
  const url = new URL(`/product/${alias}`, "https://armtek.by");
  return url.toString();
}

function safeImageUrl(values: string[]): string | undefined {
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname === "img.armtek.ru") {
        return url.toString();
      }
    } catch {
      // Ignore malformed optional images.
    }
  }
  return undefined;
}

function readPrice(
  price: string | undefined,
  currency: string | undefined,
): string | undefined {
  if (currency !== "BYN" || !price) return undefined;
  return /^\d+(?:\.\d{1,2})?$/.test(price) ? price : undefined;
}

function readAvailability(value: string | number | undefined) {
  if (value === undefined || value === "") return undefined;
  return `${String(value)} шт.`;
}

function readDelivery(value: string | undefined): string | undefined {
  if (!value || !/^\d{14}$/.test(value)) return undefined;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  return `Отгрузка ${day}.${month}.${year} ${hour}:${minute}`;
}

function readRating(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : undefined;
}

export function hashArmtekPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function parseArmtekSearchPayload(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): NormalizedOffer[] {
  const parsed = ArmtekSearchResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AdapterError(
      "armtek",
      "parse",
      "DOM_CHANGED: публичный JSON Armtek.by изменил структуру выдачи",
      { cause: parsed.error },
    );
  }

  const offers: NormalizedOffer[] = [];
  const seenIds = new Set<string>();
  for (const article of parsed.data.data.articlesData) {
    const externalUrl = safeProductUrl(article.ARTICLE_ALIAS);
    if (!externalUrl) {
      throw new AdapterError(
        "armtek",
        "parse",
        "DOM_CHANGED: Armtek.by вернул небезопасный product alias",
      );
    }
    for (const suggestion of article.SUGGESTIONS) {
      const supplierReference = String(suggestion.PARNR ?? "0");
      const warehouseReference = suggestion.KEYZAK ?? "unknown";
      const externalId = `${article.ARTID}-${supplierReference}-${warehouseReference}`;
      if (seenIds.has(externalId)) continue;
      seenIds.add(externalId);

      const priceAmount = readPrice(suggestion.PRICES1, suggestion.WAERS);
      offers.push(
        NormalizedOfferSchema.parse({
          sourceId: "armtek",
          externalId,
          externalUrl,
          title: suggestion.NAME?.trim() || article.NAME,
          description:
            suggestion.NAME?.trim() && suggestion.NAME.trim() !== article.NAME
              ? article.NAME
              : undefined,
          brand: article.BRAND,
          rawPartNumber: article.PIN,
          normalizedPartNumber: normalizePartNumber(article.PIN),
          oemNumbers: [],
          condition: "new",
          partKind: "unknown",
          priceAmount,
          priceSource: priceAmount ? "api" : undefined,
          currency: "BYN",
          imageUrl: safeImageUrl(article.PHOTO),
          availability: readAvailability(suggestion.RVALUE),
          deliveryText: readDelivery(suggestion.DLVDT),
          sellerName: "ARMTEK",
          sellerRatingPercent: readRating(suggestion.VENSL),
          fetchedAt,
          rawPayloadHash: hashArmtekPayload({
            articleId: article.ARTID,
            pin: article.PIN,
            suggestion,
          }),
        }),
      );
    }
  }
  return offers;
}
