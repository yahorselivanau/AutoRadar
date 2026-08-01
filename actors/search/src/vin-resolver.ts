import { load } from "cheerio";
import {
  VinResolutionSchema,
  VinSchema,
  maskVin,
  type VehicleCandidate,
  type VinResolution,
  type VinResolutionSource,
} from "@autoradar/domain";

import { AdapterError } from "./adapters/types";
import { createAuto1ChallengeSolver } from "./adapters/auto1/hg-security";
import { createHttpClient } from "./transport";

export type VinResolverSourceId = Exclude<VinResolutionSource, "manual">;

export interface VinResolverSource {
  readonly id: VinResolverSourceId;
  resolve(vin: string): Promise<VehicleCandidate | null>;
}

export interface VinResolverFetchOptions {
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly urlTemplate?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "AutoRadar/0.1 (+https://autoradar.vercel.app; VIN resolver)";

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    /^(not applicable|n\/a|null|undefined)$/i.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function numericYear(value: unknown): number | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const match = text.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function textValue(
  $: ReturnType<typeof load>,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (!element.length) continue;
    const value =
      clean(element.attr("content")) ??
      clean(element.attr("value")) ??
      clean(element.attr("data-value")) ??
      clean(element.attr("data-make")) ??
      clean(element.attr("data-brand")) ??
      clean(element.attr("data-model")) ??
      clean(element.attr("data-year")) ??
      clean(element.attr("data-engine")) ??
      clean(element.attr("data-transmission")) ??
      clean(element.text());
    if (value) return value;
  }
  return undefined;
}

function labelledValue(
  $: ReturnType<typeof load>,
  labels: RegExp[],
): string | undefined {
  const result = $("body *")
    .toArray()
    .find((element) => {
      const value = clean($(element).text());
      return Boolean(value && labels.some((label) => label.test(value)));
    });
  if (!result) return undefined;
  const parent = $(result).parent();
  const text = clean(parent.text());
  if (!text) return undefined;
  for (const label of labels) {
    const match = text.match(
      new RegExp(`${label.source}\\s*[:\\-]?\\s*(.+)`, "i"),
    );
    const value = clean(match?.[1]);
    if (value && value.length <= 120) return value;
  }
  return undefined;
}

function flattenJson(value: unknown, output: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJson(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  output.push(record);
  for (const child of Object.values(record)) flattenJson(child, output);
  return output;
}

function jsonVehicle($: ReturnType<typeof load>) {
  for (const script of $(
    "script[type='application/ld+json'], script",
  ).toArray()) {
    const raw = $(script).text().trim();
    if (!raw || raw.length > 1_000_000) continue;
    try {
      const records = flattenJson(JSON.parse(raw));
      for (const record of records) {
        const vehicleType = clean(record["@type"]);
        const makeValue = record.manufacturer ?? record.brand;
        const make =
          typeof makeValue === "object" && makeValue !== null
            ? (makeValue as Record<string, unknown>).name
            : makeValue;
        const model = record.model ?? record.modelName;
        if (!clean(make) && !clean(model)) continue;
        const engineValue = record.vehicleEngine ?? record.engine;
        const engine =
          typeof engineValue === "object" && engineValue !== null
            ? ((engineValue as Record<string, unknown>).name ??
              (engineValue as Record<string, unknown>).engineDisplacement)
            : engineValue;
        return {
          make: clean(make),
          model: clean(model),
          year: numericYear(
            record.modelDate ??
              record.dateVehicleFirstRegistered ??
              record.productionDate,
          ),
          body: clean(record.bodyType ?? record.vehicleConfiguration),
          engine: clean(engine),
          transmission: clean(record.vehicleTransmission),
          evidence: [
            vehicleType ? "JSON-LD type" : null,
            clean(make) ? "JSON-LD make" : null,
            clean(model) ? "JSON-LD model" : null,
            numericYear(record.modelDate) ? "JSON-LD year" : null,
          ].filter((item): item is string => Boolean(item)),
        };
      }
    } catch {
      // A page may contain non-JSON scripts; structured HTML is tried next.
    }
  }
  return null;
}

function parseVehicleHtml(
  source: VinResolverSourceId,
  html: string,
): VehicleCandidate | null {
  const $ = load(html);
  const structured = jsonVehicle($);
  const make =
    structured?.make ??
    textValue($, [
      "[data-make]",
      "[data-brand]",
      "[itemprop='manufacturer']",
      "[itemprop='brand']",
    ]) ??
    labelledValue($, [/^марка$/i, /^make$/i, /^manufacturer$/i]);
  const model =
    structured?.model ??
    textValue($, ["[data-model]", "[itemprop='model']"]) ??
    labelledValue($, [/^модель$/i, /^model$/i]);
  const year =
    structured?.year ??
    numericYear(
      textValue($, ["[data-year]", "[itemprop='modelDate']"]) ??
        labelledValue($, [/^год$/i, /^year$/i]),
    );
  const body =
    structured?.body ?? textValue($, ["[data-body]", "[itemprop='bodyType']"]);
  const engine =
    structured?.engine ??
    textValue($, ["[data-engine]", "[itemprop='vehicleEngine']"]) ??
    labelledValue($, [/двигател/i, /engine/i]);
  const transmission =
    structured?.transmission ??
    textValue($, ["[data-transmission]", "[itemprop='vehicleTransmission']"]);

  if (!make && !model && !year && !engine) return null;
  const fields = [make, model, year, body, engine, transmission].filter(
    Boolean,
  ).length;
  const evidence = [
    ...(structured?.evidence ?? []),
    make && !structured?.make ? "HTML make" : null,
    model && !structured?.model ? "HTML model" : null,
    year && !structured?.year ? "HTML year" : null,
    engine && !structured?.engine ? "HTML engine" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    id: `${source}-vin-vehicle`,
    source,
    confidence: fields >= 4 ? "high" : fields >= 2 ? "medium" : "low",
    make,
    model,
    year,
    body,
    engine,
    transmission,
    evidence: evidence.slice(0, 12),
  };
}

function safeUrl(
  source: VinResolverSourceId,
  baseUrl: string,
  vin: string,
  template?: string,
) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") {
    throw new AdapterError(
      source,
      "unsupported-query",
      "VIN resolver requires HTTPS",
    );
  }
  const path = template
    ? template.replaceAll("{vin}", encodeURIComponent(vin))
    : source === "auto1"
      ? `/Oem/Find?vinFrame=${encodeURIComponent(vin)}`
      : `/carparts/search/${encodeURIComponent(vin)}`;
  const url = new URL(path, base);
  if (url.protocol !== "https:" || url.hostname !== base.hostname) {
    throw new AdapterError(
      source,
      "unsupported-query",
      "VIN resolver URL is outside the configured source",
    );
  }
  return url;
}

function sourceUrls(
  source: VinResolverSourceId,
  baseUrl: string,
  vin: string,
  template?: string,
): URL[] {
  if (template || source !== "zap") {
    return [safeUrl(source, baseUrl, vin, template)];
  }
  return [
    safeUrl(source, baseUrl, vin),
    safeUrl(source, baseUrl, vin, "/carparts?vin={vin}"),
  ];
}

export function createHttpVinResolver(
  id: VinResolverSourceId,
  options: VinResolverFetchOptions = {},
): VinResolverSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl =
    options.baseUrl ??
    (id === "auto1"
      ? (process.env.AUTO1_BASE_URL ?? "https://auto1.by/")
      : id === "zap"
        ? (process.env.ZAP_BASE_URL ?? "https://zap.by/")
        : (process.env.ARMTEK_BASE_URL ?? "https://armtek.by/"));
  const template = options.urlTemplate;
  const auto1Solver = id === "auto1" ? createAuto1ChallengeSolver() : null;
  const auto1Http =
    id === "auto1"
      ? createHttpClient({
          sourceId: id,
          baseUrl,
          timeoutMs: options.timeoutMs ?? 10_000,
          intervalMs:
            options.intervalMs ??
            (Number(process.env.AUTO1_REQUEST_INTERVAL_MS) || 1_000),
          fetchImpl,
          challengeSolver: auto1Solver?.solve.bind(auto1Solver),
        })
      : null;

  return {
    id,
    async resolve(vin) {
      const normalizedVin = VinSchema.parse(vin);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 10_000,
      );
      try {
        for (const url of sourceUrls(id, baseUrl, normalizedVin, template)) {
          if (auto1Http && auto1Solver) {
            const loaded = await auto1Http.fetchHtml(url.toString(), {
              uaOverride: options.userAgent ?? DEFAULT_USER_AGENT,
              headers: auto1Solver.cookieHeader(),
            });
            return parseVehicleHtml(id, loaded.html);
          }
          const response = await fetchImpl(url, {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
            },
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
          });
          const html = await response.text();
          if (
            response.status === 404 &&
            id === "zap" &&
            url.pathname === "/carparts/search/" + normalizedVin
          ) {
            continue;
          }
          if (!response.ok) {
            throw new AdapterError(
              id,
              response.status === 429 ? "rate-limited" : "network",
              "VIN source returned an HTTP error",
            );
          }
          return parseVehicleHtml(id, html);
        }
        return null;
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw new AdapterError(
          id,
          error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "network",
          "VIN source is unavailable",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function mergeCandidates(
  current: VehicleCandidate | null,
  next: VehicleCandidate,
): VehicleCandidate {
  if (!current) return next;
  const fieldCount = (value: VehicleCandidate) =>
    [
      value.make,
      value.model,
      value.year,
      value.generation,
      value.body,
      value.engine,
      value.transmission,
      value.doors,
    ].filter(Boolean).length;
  const fields = [
    "make",
    "model",
    "year",
    "generation",
    "body",
    "engine",
    "transmission",
    "doors",
  ] as const;
  const merged = Object.fromEntries(
    fields.map((field) => [field, current[field] ?? next[field]]),
  );
  const count = [
    merged.make,
    merged.model,
    merged.year,
    merged.body,
    merged.engine,
    merged.transmission,
  ].filter(Boolean).length;
  return {
    ...current,
    ...merged,
    source:
      fieldCount(next) > fieldCount(current) ? next.source : current.source,
    confidence: count >= 4 ? "high" : count >= 2 ? "medium" : "low",
    evidence: [...new Set([...current.evidence, ...next.evidence])].slice(
      0,
      12,
    ),
  };
}

export async function resolveVinWithSources(
  vin: string,
  sources: readonly VinResolverSource[],
  now = new Date(),
): Promise<VinResolution> {
  const normalizedVin = VinSchema.parse(vin);
  let candidate: VehicleCandidate | null = null;
  let candidateSource: VinResolutionSource = "manual";
  const warnings: string[] = [];

  for (const source of sources) {
    try {
      const result = await source.resolve(normalizedVin);
      if (result) {
        candidate = mergeCandidates(candidate, result);
        candidateSource = candidate.source;
        if (candidate.make && candidate.model && candidate.year) break;
      }
    } catch (error) {
      const code = error instanceof AdapterError ? error.code : "unknown";
      warnings.push(`${source.id}: источник не ответил (${code}).`);
    }
  }

  const hasAnyVehicleField = Boolean(
    candidate?.make || candidate?.model || candidate?.year,
  );
  const complete = Boolean(
    candidate?.make && candidate?.model && candidate?.year,
  );
  if (!candidate) {
    warnings.push(
      "Не удалось получить данные автомобиля. Заполните карточку вручную.",
    );
  } else if (!complete) {
    warnings.push(
      "Данные VIN неполные — проверьте и дополните автомобиль вручную.",
    );
  }

  return VinResolutionSchema.parse({
    status: complete
      ? "resolved"
      : hasAnyVehicleField
        ? "partial"
        : "unresolved",
    maskedVin: maskVin(normalizedVin),
    source: candidateSource,
    candidates: candidate ? [candidate] : [],
    warnings: [...new Set(warnings)].slice(0, 8),
    resolvedAt: now.toISOString(),
  });
}

export function createConfiguredVinResolvers(): VinResolverSource[] {
  const configured = (process.env.VIN_RESOLVER_SOURCES ?? "auto1,zap")
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value): value is VinResolverSourceId =>
        value === "auto1" || value === "zap" || value === "armtek",
    );
  return [...new Set(configured)].flatMap((id) => {
    if (id === "armtek" && !process.env.ARMTEK_VIN_URL_TEMPLATE?.trim()) {
      return [];
    }
    return [
      createHttpVinResolver(id, {
        baseUrl:
          id === "auto1"
            ? process.env.AUTO1_BASE_URL
            : id === "zap"
              ? process.env.ZAP_BASE_URL
              : process.env.ARMTEK_BASE_URL,
        urlTemplate:
          id === "armtek" ? process.env.ARMTEK_VIN_URL_TEMPLATE : undefined,
        timeoutMs: Number(process.env.VIN_RESOLVER_HTTP_TIMEOUT_MS) || 10_000,
        userAgent: process.env.VIN_RESOLVER_USER_AGENT || DEFAULT_USER_AGENT,
      }),
    ];
  });
}
