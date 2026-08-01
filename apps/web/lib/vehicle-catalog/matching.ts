export type VehicleCatalogModel = {
  id: number;
  makeId: number;
  name: string;
  nameNormalized: string;
  generation?: string;
  bodyType?: string;
  yearFrom?: number;
  yearTo?: number;
};

export type VehicleCatalogMatch = VehicleCatalogModel & {
  label: string;
};

export function normalizeVehicleCatalogText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-ZА-ЯЁ0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isYearActive(model: VehicleCatalogModel, year?: number): boolean {
  return (
    year == null ||
    model.yearFrom == null ||
    (model.yearFrom <= year && (model.yearTo == null || model.yearTo >= year))
  );
}

function modelNameMatches(modelName: string, candidateName: string): boolean {
  return (
    modelName === candidateName ||
    candidateName.startsWith(`${modelName} `) ||
    modelName.startsWith(`${candidateName} `)
  );
}

function generationMatches(
  candidate: VehicleCatalogModel,
  requestedGeneration?: string,
): boolean {
  if (!requestedGeneration) return true;
  const requested = normalizeVehicleCatalogText(requestedGeneration);
  const candidateLabel = normalizeVehicleCatalogText(
    `${candidate.name} ${candidate.generation ?? ""}`,
  );
  return (
    candidateLabel === requested ||
    candidateLabel.includes(requested) ||
    requested.includes(candidateLabel) ||
    (candidate.generation != null &&
      requested.includes(normalizeVehicleCatalogText(candidate.generation)))
  );
}

function bodyMatches(
  candidate: VehicleCatalogModel,
  requestedBody?: string,
): boolean {
  if (!requestedBody) return true;
  const requested = normalizeVehicleCatalogText(requestedBody);
  return [candidate.bodyType, candidate.name]
    .filter(Boolean)
    .some((value) =>
      normalizeVehicleCatalogText(value as string).includes(requested),
    );
}

export function selectVehicleCatalogMatches({
  models,
  model,
  year,
  generation,
  body,
}: {
  models: VehicleCatalogModel[];
  model: string;
  year?: number;
  generation?: string;
  body?: string;
}): VehicleCatalogMatch[] {
  const requestedModel = normalizeVehicleCatalogText(model);
  return models
    .filter((candidate) => isYearActive(candidate, year))
    .filter((candidate) =>
      modelNameMatches(requestedModel, candidate.nameNormalized),
    )
    .filter((candidate) => generationMatches(candidate, generation))
    .filter((candidate) => bodyMatches(candidate, body))
    .map((candidate) => ({
      ...candidate,
      label: `${candidate.name}${candidate.generation ? ` (${candidate.generation})` : ""}`,
    }));
}
