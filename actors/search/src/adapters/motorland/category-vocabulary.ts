/**
 * Versioned labels and aliases observed in the Motorland.by catalogue.
 *
 * The vocabulary is used only to compare a request with a category returned
 * by Motorland. It never constructs a product URL or a catalogue slug.
 */
export const MOTORLAND_CATEGORY_VOCABULARY_VERSION =
  "motorland-category-vocabulary.v1";

type CategoryAlias = {
  readonly label: string;
  readonly aliases: readonly string[];
};

const entries: readonly CategoryAlias[] = [
  {
    label: "Насос водяной (помпа)",
    aliases: ["водяной насос", "водяная помпа", "помпа"],
  },
  {
    label: "Головка блока (ГБЦ)",
    aliases: ["головка блока цилиндров", "гбц"],
  },
  {
    label: "Насос масляный",
    aliases: ["масляный насос"],
  },
  {
    label: "Фильтр топливный",
    aliases: ["топливный фильтр"],
  },
  {
    label: "Лямбда зонд",
    aliases: ["лямбда-зонд", "лямбда зонд"],
  },
  {
    label: "Колодки тормозные",
    aliases: ["тормозные колодки", "тормозная колодка"],
  },
  {
    label: "Колодки стояночного тормоза",
    aliases: ["колодки ручника", "тормозные колодки ручника"],
  },
  {
    label: "Фара (передняя)",
    aliases: ["передняя фара", "передние фары"],
  },
  {
    label: "Фара противотуманная (галогенка)",
    aliases: ["противотуманная фара", "противотуманные фары"],
  },
  {
    label: "Фонарь (задний)",
    aliases: ["задний фонарь", "задние фонари"],
  },
  {
    label: "Полуось (приводной вал, шрус)",
    aliases: ["приводной вал", "полуось"],
  },
];

function comparable(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasToLabel = new Map(
  entries.flatMap(({ label, aliases }) =>
    [label, ...aliases].map((value) => [comparable(value), label] as const),
  ),
);

export function canonicalMotorlandCategory(value: string): string {
  return aliasToLabel.get(comparable(value)) ?? value.trim();
}

export function motorlandCategoryVariants(value: string): string[] {
  const canonical = canonicalMotorlandCategory(value);
  const variants = new Set<string>([canonical, value.trim()]);
  for (const source of [canonical, value]) {
    for (const part of source.split(/\s*[,/]\s*/)) variants.add(part.trim());
    for (const part of source.split(/\s*[()]\s*/)) variants.add(part.trim());
  }
  return [...variants].filter(Boolean);
}

function comparableWords(value: string): string[] {
  return comparable(value)
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export function matchesMotorlandCategory(
  actual: string,
  requested: string,
): boolean {
  const requestedVariants = motorlandCategoryVariants(requested);
  return motorlandCategoryVariants(actual).some((actualVariant) =>
    requestedVariants.some((requestedVariant) => {
      const left = comparable(actualVariant);
      const right = comparable(requestedVariant);
      return (
        left === right ||
        comparableWords(actualVariant).join(" ") ===
          comparableWords(requestedVariant).join(" ")
      );
    }),
  );
}
