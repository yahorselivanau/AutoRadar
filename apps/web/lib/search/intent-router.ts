import {
  SearchIntentSchema,
  VinSchema,
  normalizePartNumber,
  type SearchIntent,
} from "@autoradar/domain";

const SYMPTOM_PATTERN =
  /(?:не\s+работает|сломал(?:ся|ась|ось)?|стучит|скрипит|гудит|теч[её]т|дымит|перегрева|вибраци|горит\s+(?:ошибка|лампа)|не\s+(?:заводится|поднимается|опускается|тормозит|крутит|включается|открывается|охлаждает)|плохо\s+тормозит|слыш[а-яё]*\s+(?:странн[а-яё]*\s+)?звук|появил(?:ся|ась)\s+(?:звук|запах|вибраци))/i;
const CONSUMABLE_PATTERN =
  /(?:масл[оа]|фильтр[а-яё]*|антифриз[а-яё]*|тормозн[а-яё]*\s+жидк[а-яё]*|жидк[а-яё]*\s+гур|свеч[а-яё]*|щетк[а-яё]*\s+(?:стеклоочистител|дворник)|ламп[а-яё]*|аккумулятор[а-яё]*)/i;
const ACCESSORY_PATTERN =
  /(?:коврик[а-яё]*|чех(?:ол|л)[а-яё]*|багажник[а-яё]*\s+на\s+крыш|держател[а-яё]*|зарядк[а-яё]*|автокресл[а-яё]*|дефлектор[а-яё]*|органайзер[а-яё]*)/i;
const CHASSIS_CODE_PATTERN = /^[A-Z]\d{2,3}$/;
const DTC_PATTERN = /\b[BCPU][0-9A-F]{4}\b/i;
const EXPLICIT_ARTICLE_PATTERN =
  /(?:артикул|oem|номер(?:\s+детали)?|код(?:\s+детали)?)\s*[:№#-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9 ./_-]{3,30})/i;

function tokens(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^A-ZА-Я0-9./_-]+/)
    .map((token) => token.replace(/^[./_-]+|[./_-]+$/g, ""))
    .filter(Boolean);
}

function likelyArticleToken(text: string): string | undefined {
  const explicit = text.match(EXPLICIT_ARTICLE_PATTERN)?.[1]?.trim();
  if (explicit) {
    const articleParts = explicit
      .split(/\s+/)
      .filter((part) => /\d/.test(part) && !CHASSIS_CODE_PATTERN.test(part))
      .slice(0, 4);
    if (articleParts.length > 0) return articleParts.join(" ");
  }

  const parts = tokens(text);
  const direct = parts.find((token) => {
    if (token.length < 5 || token.length > 30) return false;
    if (DTC_PATTERN.test(token)) return false;
    if (/^(?:19|20)\d{2}$/.test(token)) return false;
    const normalized = normalizePartNumber(token);
    return (
      normalized.length >= 5 &&
      /\d/.test(normalized) &&
      (/[A-ZА-Я]/.test(normalized) || /^\d{7,20}$/.test(normalized))
    );
  });
  if (direct) {
    const index = parts.indexOf(direct);
    const prefix = parts[index - 1];
    if (prefix && /^[A-Z]{1,2}$/.test(prefix)) {
      return `${prefix} ${direct}`;
    }
    return direct;
  }

  for (let index = 0; index < parts.length - 1; index += 1) {
    const prefix = parts[index]!;
    if (!/^[A-Z]{1,2}$/.test(prefix)) continue;
    const numericParts: string[] = [];
    for (const part of parts.slice(index + 1, index + 4)) {
      if (!/\d/.test(part)) break;
      if (numericParts.length === 0 && normalizePartNumber(part).length < 3) {
        break;
      }
      numericParts.push(part);
    }
    const candidate = [prefix, ...numericParts].join(" ");
    if (normalizePartNumber(candidate).length >= 5) return candidate;
  }
  return undefined;
}

export function findVinInText(text: string): string | undefined {
  for (const token of tokens(text)) {
    const parsed = VinSchema.safeParse(token);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export function classifySearchIntent(rawText: string): SearchIntent {
  const text = rawText.trim();
  const vin = findVinInText(text);
  const symptom = SYMPTOM_PATTERN.test(text) || DTC_PATTERN.test(text);
  const rawPartNumber = likelyArticleToken(text);

  if (vin) {
    return SearchIntentSchema.parse({
      mode: "vehicle_part",
      rawText: text,
      vin,
      confidence: "high",
    });
  }
  if (rawPartNumber) {
    return SearchIntentSchema.parse({
      mode: "part_number",
      rawText: text,
      rawPartNumber,
      normalizedPartNumber: normalizePartNumber(rawPartNumber),
      confidence: "high",
    });
  }
  if (symptom) {
    return SearchIntentSchema.parse({
      mode: "symptom",
      rawText: text,
      confidence: "high",
    });
  }
  if (CONSUMABLE_PATTERN.test(text)) {
    return SearchIntentSchema.parse({
      mode: "consumable",
      rawText: text,
      confidence: "medium",
    });
  }
  if (ACCESSORY_PATTERN.test(text)) {
    return SearchIntentSchema.parse({
      mode: "accessory",
      rawText: text,
      confidence: "medium",
    });
  }
  return SearchIntentSchema.parse({
    mode: "vehicle_part",
    rawText: text,
    confidence: "low",
  });
}
