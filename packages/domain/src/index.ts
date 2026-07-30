import { z } from "zod";

export const VehicleContextSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1886).max(2200),
  generation: z.string().optional(),
  body: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
  doors: z.number().int().min(2).max(6).optional(),
});

export const VinSchema = z
  .string()
  .transform((value) => value.toUpperCase().replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .length(17, "VIN должен содержать 17 символов.")
      .regex(
        /^[A-HJ-NPR-Z0-9]{17}$/,
        "VIN может содержать латинские буквы и цифры, кроме I, O и Q.",
      ),
  );

export const SavedVehicleSchema = VehicleContextSchema.extend({
  id: z.string().min(1),
  displayName: z.string().trim().min(1),
  vin: VinSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const GarageStateSchema = z.object({
  vehicles: z.array(SavedVehicleSchema).max(20).default([]),
  activeVehicleId: z.string().nullable().default(null),
  pendingVin: VinSchema.optional(),
});

export const PartConstraintKeySchema = z.enum([
  "mounting",
  "axle",
  "operation",
  "motorIncluded",
  "doorCount",
  "body",
  "brakeSystem",
  "diameter",
  "length",
  "width",
  "height",
  "thread",
  "connector",
  "color",
  "material",
]);

export const PartConstraintSchema = z.object({
  key: PartConstraintKeySchema,
  value: z.string().trim().min(1),
});

export const PartRequestSchema = z.object({
  name: z.string().min(2),
  side: z.enum(["left", "right", "unknown"]).default("unknown"),
  position: z.enum(["front", "rear", "unknown"]).default("unknown"),
  condition: z.enum(["new", "used", "any"]).default("any"),
  rawPartNumber: z.string().optional(),
  normalizedPartNumber: z.string().optional(),
  constraints: z.array(PartConstraintSchema).max(12).default([]),
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
    doors: z.number().int().min(2).max(6).nullable(),
  }),
  side: z.enum(["left", "right", "unknown"]),
  position: z.enum(["front", "rear", "unknown"]),
  condition: z.enum(["new", "used", "any"]),
  constraints: z.array(PartConstraintSchema).max(12),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().min(1).nullable(),
});

export const SearchClarificationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const SearchClarificationSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["generation", "body", "engine", "doors", "part_attribute"]),
  attributeKey: PartConstraintKeySchema.optional(),
  question: z.string().min(1),
  options: z.array(SearchClarificationOptionSchema).min(2).max(8),
});

export const SavedSearchContextSchema = z.object({
  activeVehicle: VehicleContextSchema.optional(),
  partPreferences: z
    .record(z.string(), z.array(PartConstraintSchema).max(12))
    .default({}),
});

export const SourceIdSchema = z.enum([
  "mock",
  "armtek",
  "auto1",
  "av-parts",
  "davinagaz",
  "motorland",
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
  sourceAttributes: z.record(z.string(), z.array(z.string().min(1))).optional(),
  matchStatus: z.enum(["confirmed", "possible"]).optional(),
  matchReasons: z.array(z.string().min(1)).optional(),
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

export const SearchJobSourceStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "empty",
  "timeout",
  "blocked",
  "failed",
  "disabled",
]);

export const ConversationStateSchema = z.object({
  activeVehicle: VehicleContextSchema.nullable().default(null),
  searchDraft: SearchRequestSchema.nullable().default(null),
  latestSearchJobId: z.string().uuid().nullable().default(null),
  latestSearchSummary: z
    .object({
      offerCount: z.number().int().nonnegative(),
      sourceCount: z.number().int().nonnegative(),
      failedSourceCount: z.number().int().nonnegative(),
      minPrice: z.string().nullable(),
      maxPrice: z.string().nullable(),
    })
    .nullable()
    .default(null),
});

export const GuestUsageSchema = z.object({
  requestsUsed: z.number().int().nonnegative(),
  requestsLimit: z.number().int().positive(),
  searchesUsed: z.number().int().nonnegative(),
  searchesLimit: z.number().int().positive(),
  resetsAt: z.iso.datetime(),
});

export const SearchSourceProgressSchema = z.object({
  sourceId: SourceIdSchema,
  status: SearchJobSourceStatusSchema,
  offerCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
});

export const SearchJobResultSchema = z.object({
  jobId: z.string().uuid(),
  status: SearchJobStatusSchema,
  offers: z.array(NormalizedOfferSchema),
  sources: z.array(SearchSourceProgressSchema),
  clarification: SearchClarificationSchema.nullable(),
});

export type VehicleContext = z.infer<typeof VehicleContextSchema>;
export type SavedVehicle = z.infer<typeof SavedVehicleSchema>;
export type GarageState = z.infer<typeof GarageStateSchema>;
export type PartConstraintKey = z.infer<typeof PartConstraintKeySchema>;
export type PartConstraint = z.infer<typeof PartConstraintSchema>;
export type PartRequest = z.infer<typeof PartRequestSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type PartRequestExtraction = z.infer<typeof PartRequestExtractionSchema>;
export type SearchClarification = z.infer<typeof SearchClarificationSchema>;
export type SavedSearchContext = z.infer<typeof SavedSearchContextSchema>;
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;
export type SourceId = z.infer<typeof SourceIdSchema>;
export type SearchJobStatus = z.infer<typeof SearchJobStatusSchema>;
export type SearchJobSourceStatus = z.infer<typeof SearchJobSourceStatusSchema>;
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type GuestUsage = z.infer<typeof GuestUsageSchema>;
export type SearchSourceProgress = z.infer<typeof SearchSourceProgressSchema>;
export type SearchJobResult = z.infer<typeof SearchJobResultSchema>;

export function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[\s./-]+/g, "");
}

export function normalizeVin(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

export function maskVin(value: string): string {
  const normalized = normalizeVin(value);
  if (normalized.length < 7) return "VIN скрыт";
  return `${normalized.slice(0, 3)}••••••••••${normalized.slice(-4)}`;
}
