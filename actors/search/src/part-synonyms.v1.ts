import type { SourceId } from "@autoradar/domain";

type SynonymEntry = {
  canonical: string;
  aliases: readonly string[];
  sourceVariants?: Partial<Record<SourceId, readonly string[]>>;
};

export const PART_SYNONYMS_VERSION = "part-synonyms.v1";

const entries: readonly SynonymEntry[] = [
  {
    canonical: "механизм стеклоподъёмника",
    aliases: [
      "стеклоподъемник",
      "стеклоподъёмник",
      "механизм стеклоподъемника",
      "трапеция стеклоподъемника",
    ],
    sourceVariants: {
      motorland: ["стеклоподъемник", "механизм стеклоподъемника"],
      remzona: ["стеклоподъемник"],
    },
  },
  {
    canonical: "масляный фильтр",
    aliases: ["фильтр масла", "маслофильтр"],
  },
  {
    canonical: "салонный фильтр",
    aliases: ["фильтр салона", "фильтр кондиционера"],
  },
  {
    canonical: "воздушный фильтр",
    aliases: ["фильтр воздуха", "фильтр двигателя"],
  },
  {
    canonical: "щётка стеклоочистителя",
    aliases: ["щетка стеклоочистителя", "щетки дворников", "дворники"],
  },
];

function comparable(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizePartName(value: string): string {
  const normalized = comparable(value);
  const entry = entries.find(
    ({ canonical, aliases }) =>
      comparable(canonical) === normalized ||
      aliases.some((alias) => comparable(alias) === normalized),
  );
  return entry?.canonical ?? value.trim();
}

export function sourcePartQuery(value: string, sourceId: SourceId): string {
  const canonical = canonicalizePartName(value);
  const entry = entries.find(
    (candidate) => comparable(candidate.canonical) === comparable(canonical),
  );
  return entry?.sourceVariants?.[sourceId]?.[0] ?? canonical;
}
