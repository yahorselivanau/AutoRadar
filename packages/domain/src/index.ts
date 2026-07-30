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

export const SearchVehicleContextSchema = VehicleContextSchema.extend({
  year: z.number().int().min(1886).max(2200).optional(),
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

export const VehicleDraftSchema = z.object({
  vin: VinSchema.optional(),
  make: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  year: z.number().int().min(1886).max(2200).optional(),
  generation: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  engine: z.string().trim().min(1).optional(),
  transmission: z.string().trim().min(1).optional(),
  doors: z.number().int().min(2).max(6).optional(),
});

export const VehicleCandidateSchema = VehicleDraftSchema.omit({
  vin: true,
}).extend({
  id: z.string().min(1),
  source: z.enum(["nhtsa-vpic", "manual", "source-catalog"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(z.string().trim().min(1)).max(12).default([]),
});

export const VinResolutionSchema = z.object({
  status: z.enum(["invalid", "unresolved", "partial", "resolved"]),
  maskedVin: z.string().min(1),
  source: z.literal("nhtsa-vpic"),
  candidates: z.array(VehicleCandidateSchema).max(5),
  warnings: z.array(z.string().trim().min(1)).max(8).default([]),
  resolvedAt: z.iso.datetime(),
});

export const SavedVehicleSchema = VehicleContextSchema.extend({
  id: z.string().min(1),
  displayName: z.string().trim().min(1),
  vin: VinSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  vinResolutionSource: z.enum(["nhtsa-vpic", "manual"]).optional(),
  vinResolutionProvenance: z
    .object({
      resolvedAt: z.iso.datetime(),
      candidateId: z.string().min(1).optional(),
    })
    .optional(),
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

export const SearchIntentModeSchema = z.enum([
  "part_number",
  "vehicle_part",
  "consumable",
  "accessory",
  "symptom",
]);

export const SearchIntentSchema = z.object({
  mode: SearchIntentModeSchema,
  rawText: z.string().trim().min(1),
  vin: VinSchema.optional(),
  rawPartNumber: z.string().trim().min(1).optional(),
  normalizedPartNumber: z.string().trim().min(1).optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(2),
  locale: z.literal("ru-BY").default("ru-BY"),
  currency: z.literal("BYN").default("BYN"),
  vehicle: SearchVehicleContextSchema.optional(),
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

export const SourceIdSchema = z.enum([
  "mock",
  "armtek",
  "auto1",
  "av-parts",
  "motorland",
  "remzona",
  "zap",
]);

export const SourceSearchStrategySchema = z.enum([
  "article",
  "vehicle_catalog",
  "vin",
  "category",
  "text",
  "skip",
]);

export const SourceSearchPlanEntrySchema = z.object({
  sourceId: SourceIdSchema,
  strategy: SourceSearchStrategySchema,
  query: z.string().min(1).nullable(),
  skipReason: z.string().min(1).nullable(),
});

export const SourceSearchPlanSchema = z.object({
  entries: z.array(SourceSearchPlanEntrySchema),
});

export const ConversationReadinessSchema = z.enum([
  "collecting",
  "needs_vehicle_confirmation",
  "needs_part_confirmation",
  "ready",
  "searching",
]);

export const PendingClarificationSchema = SearchClarificationSchema.extend({
  sourceId: SourceIdSchema.optional(),
  searchJobId: z.string().uuid().optional(),
  originalSearchRequest: SearchRequestSchema.optional(),
});

export const SymptomHypothesisSchema = z.object({
  id: z.string().min(1),
  partName: z.string().trim().min(2),
  label: z.string().trim().min(2),
  confidence: z.enum(["high", "medium", "low"]),
  explanation: z.string().trim().min(1).max(500),
});

export const SymptomAssessmentSchema = z.object({
  observations: z.array(z.string().trim().min(1)).min(1).max(12),
  nextQuestion: z.string().trim().min(1).max(240).nullable(),
  hypotheses: z.array(SymptomHypothesisSchema).min(1).max(3),
  selectedHypothesisId: z.string().min(1).nullable().default(null),
  safetySeverity: z.enum(["none", "service_soon", "stop_driving"]),
  safetyMessage: z.string().trim().min(1).max(500).nullable(),
  clarificationCount: z.number().int().min(0).max(5),
});

export const SavedSearchContextSchema = z.object({
  activeVehicle: VehicleContextSchema.optional(),
  partPreferences: z
    .record(z.string(), z.array(PartConstraintSchema).max(12))
    .default({}),
});

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
  matchEvidence: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("structured_article"),
        requestedNormalizedArticle: z.string().min(1),
        offeredNormalizedArticle: z.string().min(1),
      }),
      z.object({
        kind: z.literal("source_vehicle_catalog"),
        sourceVehicleId: z.string().min(1),
        attributes: z.array(z.string().min(1)).min(1),
      }),
      z.object({
        kind: z.literal("textual"),
        matchedTerms: z.array(z.string().min(1)).min(1),
      }),
    ])
    .optional(),
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
  schemaVersion: z.literal(2).default(2),
  activeVehicle: VehicleContextSchema.nullable().default(null),
  vehicleDraft: VehicleDraftSchema.nullable().default(null),
  searchDraft: SearchRequestSchema.nullable().default(null),
  readiness: ConversationReadinessSchema.default("collecting"),
  pendingClarification: PendingClarificationSchema.nullable().default(null),
  symptomAssessment: SymptomAssessmentSchema.nullable().default(null),
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
export type SearchVehicleContext = z.infer<typeof SearchVehicleContextSchema>;
export type VehicleDraft = z.infer<typeof VehicleDraftSchema>;
export type VehicleCandidate = z.infer<typeof VehicleCandidateSchema>;
export type VinResolution = z.infer<typeof VinResolutionSchema>;
export type SavedVehicle = z.infer<typeof SavedVehicleSchema>;
export type GarageState = z.infer<typeof GarageStateSchema>;
export type PartConstraintKey = z.infer<typeof PartConstraintKeySchema>;
export type PartConstraint = z.infer<typeof PartConstraintSchema>;
export type PartRequest = z.infer<typeof PartRequestSchema>;
export type SearchIntentMode = z.infer<typeof SearchIntentModeSchema>;
export type SearchIntent = z.infer<typeof SearchIntentSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type PartRequestExtraction = z.infer<typeof PartRequestExtractionSchema>;
export type SearchClarification = z.infer<typeof SearchClarificationSchema>;
export type PendingClarification = z.infer<typeof PendingClarificationSchema>;
export type ConversationReadiness = z.infer<typeof ConversationReadinessSchema>;
export type SymptomHypothesis = z.infer<typeof SymptomHypothesisSchema>;
export type SymptomAssessment = z.infer<typeof SymptomAssessmentSchema>;
export type SavedSearchContext = z.infer<typeof SavedSearchContextSchema>;
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;
export type SourceId = z.infer<typeof SourceIdSchema>;
export type SourceSearchStrategy = z.infer<typeof SourceSearchStrategySchema>;
export type SourceSearchPlanEntry = z.infer<typeof SourceSearchPlanEntrySchema>;
export type SourceSearchPlan = z.infer<typeof SourceSearchPlanSchema>;
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
