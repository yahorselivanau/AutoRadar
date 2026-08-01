/**
 * Versioned terms observed in the Zap.by category menu.
 *
 * These aliases only help compare a request with a label returned in SSR
 * HTML. They must never be used to construct a category URL.
 */
export const ZAP_CATEGORY_VOCABULARY_VERSION = "zap-category-vocabulary.v1";

type CategoryAlias = {
  readonly label: string;
  readonly aliases: readonly string[];
};

const entries: readonly CategoryAlias[] = [
  {
    label: "Стеклоподъемник",
    aliases: [
      "механизм стеклоподъемника",
      "механизм стеклоподъёмника",
      "трапеция стеклоподъемника",
    ],
  },
  {
    label: "Щетки стеклоочистителя",
    aliases: [
      "щётки стеклоочистителя",
      "щётка стеклоочистителя",
      "щетка стеклоочистителя",
      "дворники",
    ],
  },
  {
    label: "Водяной насос / помпа",
    aliases: ["водяной насос", "помпа"],
  },
  {
    label: "Термостат / Корпус термостата",
    aliases: ["термостат", "корпус термостата"],
  },
  {
    label: "Подушка двигателя (Опора)",
    aliases: ["подушка двигателя", "опора двигателя"],
  },
  {
    label: "Гидрокомпенсаторы / толкатели",
    aliases: ["гидрокомпенсаторы", "толкатели"],
  },
  {
    label: "Тормозные колодки",
    aliases: ["тормозная колодка", "тормозные колодки"],
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

/** Return the source label for a user-facing synonym when one is known. */
export function canonicalZapCategoryLabel(value: string): string {
  return aliasToLabel.get(comparable(value)) ?? value.trim();
}

/**
 * Split compound labels such as "Водяной насос / помпа" into comparable
 * alternatives while keeping the full label available for exact matching.
 */
export function zapCategoryLabelVariants(value: string): string[] {
  const canonical = canonicalZapCategoryLabel(value);
  const variants = new Set<string>([canonical, value.trim()]);
  for (const part of canonical.split(/\s*\/\s*/)) variants.add(part.trim());
  for (const part of canonical.split(/\s*[()]\s*/)) variants.add(part.trim());
  return [...variants].filter(Boolean);
}
