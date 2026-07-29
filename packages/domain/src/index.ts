import { z } from "zod";

export const VehicleContextSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1886).max(2200),
  generation: z.string().optional(),
  body: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
});

export const PartRequestSchema = z.object({
  name: z.string().min(2),
  side: z.enum(["left", "right", "unknown"]).default("unknown"),
  position: z.enum(["front", "rear", "unknown"]).default("unknown"),
  condition: z.enum(["new", "used", "any"]).default("any"),
  rawPartNumber: z.string().optional(),
  normalizedPartNumber: z.string().optional(),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(2),
  locale: z.literal("ru-BY").default("ru-BY"),
  currency: z.literal("BYN").default("BYN"),
  vehicle: VehicleContextSchema.optional(),
  part: PartRequestSchema,
});

export const PartRequestExtractionSchema = z.object({
  summary: z.string().min(1),
  partName: z.string().min(2).nullable(),
  rawPartNumber: z.string().min(1).nullable(),
  vehicle: z.object({
    make: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    year: z.number().int().min(1886).max(2200).nullable(),
    generation: z.string().min(1).nullable(),
    body: z.string().min(1).nullable(),
    engine: z.string().min(1).nullable(),
    transmission: z.string().min(1).nullable(),
  }),
  side: z.enum(["left", "right", "unknown"]),
  position: z.enum(["front", "rear", "unknown"]),
  condition: z.enum(["new", "used", "any"]),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().min(1).nullable(),
});

export const SourceIdSchema = z.enum([
  "mock",
  "armtek",
  "av-parts",
  "remzona",
  "zap",
]);

export const NormalizedOfferSchema = z.object({
  sourceId: SourceIdSchema,
  externalId: z.string().min(1),
  externalUrl: z.url(),
  title: z.string().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  rawPartNumber: z.string().optional(),
  normalizedPartNumber: z.string().optional(),
  oemNumbers: z.array(z.string().min(1)).default([]),
  condition: z.enum(["new", "used", "unknown"]),
  partKind: z.enum(["original", "analog", "unknown"]),
  priceAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  priceSource: z
    .enum(["api", "json_ld", "microdata", "data_attribute", "dom"])
    .optional(),
  currency: z.literal("BYN"),
  imageUrl: z.url().optional(),
  availability: z.string().optional(),
  deliveryText: z.string().optional(),
  location: z.string().optional(),
  sellerName: z.string().optional(),
  sellerRatingPercent: z.number().int().min(0).max(100).optional(),
  compatibilityText: z.string().optional(),
  fetchedAt: z.iso.datetime(),
  rawPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const SearchJobStatusSchema = z.enum([
  "created",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export type VehicleContext = z.infer<typeof VehicleContextSchema>;
export type PartRequest = z.infer<typeof PartRequestSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type PartRequestExtraction = z.infer<typeof PartRequestExtractionSchema>;
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;
export type SearchJobStatus = z.infer<typeof SearchJobStatusSchema>;

export function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[\s./-]+/g, "");
}
