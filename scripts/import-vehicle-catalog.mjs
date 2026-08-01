import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const sourceFile =
  process.argv[2] ?? "/Users/egorselivanov/Desktop/brands-and-models.json";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dryRun = process.env.VEHICLE_CATALOG_DRY_RUN === "true";

if (!dryRun && (!supabaseUrl || !secretKey)) {
  throw new Error(
    "Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY в окружении.",
  );
}

function normalize(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-ZА-ЯЁ0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function batches(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response;
}

const raw = await readFile(sourceFile, "utf8");
const catalog = JSON.parse(raw);
if (!Array.isArray(catalog.brands)) {
  throw new Error("В JSON отсутствует массив brands.");
}

const catalogVersion = createHash("sha256")
  .update(raw)
  .digest("hex")
  .slice(0, 16);
const makes = catalog.brands.map((brand) => ({
  source: "zap.by",
  source_id: Number.isInteger(brand.id) ? brand.id : null,
  name: String(brand.name).trim(),
  name_ru: brand.nameRu ? String(brand.nameRu).trim() : null,
  name_normalized: normalize(String(brand.name)),
  name_ru_normalized: brand.nameRu ? normalize(String(brand.nameRu)) : null,
  catalog_version: catalogVersion,
  updated_at: new Date().toISOString(),
}));

if (!dryRun) {
  await supabaseRequest(
    "vehicle_catalog_makes?on_conflict=source%2Cname_normalized",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(makes),
    },
  );
}

const makeRows = dryRun
  ? makes.map((make, index) => ({
      id: index + 1,
      name_normalized: make.name_normalized,
    }))
  : await supabaseRequest(
      `vehicle_catalog_makes?select=id,name_normalized&source=eq.zap.by&name_normalized=in.(${makes
        .map((make) => encodeURIComponent(`"${make.name_normalized}"`))
        .join(",")})`,
    ).then((response) => response.json());
const makeByName = new Map(
  makeRows.map((row) => [row.name_normalized, row.id]),
);

const models = [];
for (const brand of catalog.brands) {
  const makeId = makeByName.get(normalize(String(brand.name)));
  if (!makeId)
    throw new Error(`Не найдена импортированная марка ${brand.name}.`);
  for (const model of brand.models ?? []) {
    const name = String(model.name).trim();
    const generation = model.generation
      ? String(model.generation).trim()
      : null;
    const bodyType = model.bodyType ? String(model.bodyType).trim() : null;
    const yearFrom = Number(model.yearFrom);
    const yearTo = model.yearTo == null ? null : Number(model.yearTo);
    const key = [
      "zap.by",
      makeId,
      normalize(name),
      normalize(generation ?? ""),
      normalize(bodyType ?? ""),
      yearFrom,
      yearTo ?? "now",
    ].join("|");
    models.push({
      make_id: makeId,
      source: "zap.by",
      catalog_key: createHash("sha256").update(key).digest("hex"),
      name,
      name_normalized: normalize(name),
      generation,
      body_type: bodyType,
      year_from: yearFrom,
      year_to: yearTo,
      catalog_version: catalogVersion,
      updated_at: new Date().toISOString(),
    });
  }
}

for (const [index, batch] of batches(models, 250).entries()) {
  if (!dryRun) {
    await supabaseRequest("vehicle_catalog_models?on_conflict=catalog_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(batch),
    });
  }
  process.stdout.write(
    `${dryRun ? "Проверено" : "Импортировано"} моделей: ${Math.min(
      (index + 1) * 250,
      models.length,
    )}/${models.length}\n`,
  );
}

console.log(
  JSON.stringify(
    {
      sourceFile,
      catalogVersion,
      makes: makes.length,
      models: models.length,
    },
    null,
    2,
  ),
);
