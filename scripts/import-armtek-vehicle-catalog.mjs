import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const sourceFile = process.argv[2] ?? "data/vehicle-catalog/armtek/brands.txt";
const fallbackMake = process.argv[3]?.trim() || null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dryRun = process.env.VEHICLE_CATALOG_DRY_RUN === "true";
const zapMakeAliases = new Map([["GEELY", "GEELY BELGEE"]]);

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

function parseRows(raw) {
  let currentMake = fallbackMake;
  const rows = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const section = line.match(/^@@\s*(.+?)\s*$/u);
    if (section) {
      currentMake = section[1].trim();
      continue;
    }
    if (!currentMake || /^[A-Za-zА-Яа-яЁё0-9]$/u.test(line)) continue;
    const model = line.match(/^(.*?)\s*\(([^()]*)\)$/u);
    rows.push({
      make: currentMake,
      name: (model?.[1] ?? line).trim(),
      generation: model?.[2]?.trim() || null,
    });
  }
  return [
    ...new Map(
      rows.map((row) => [
        `${normalize(row.make)}|${normalize(row.name)}|${normalize(row.generation ?? "")}`,
        row,
      ]),
    ).values(),
  ];
}

function sqlSafeValue(value) {
  return value == null ? null : String(value);
}

function generationTokens(value) {
  return new Set(
    normalize(value ?? "")
      .split(" ")
      .filter(Boolean),
  );
}

function generationsOverlap(left, right) {
  const rightTokens = generationTokens(right);
  return [...generationTokens(left)].some((token) => rightTokens.has(token));
}

function zapMakeName(make) {
  const normalized = normalize(make);
  return zapMakeAliases.get(normalized) ?? normalized;
}

function inferYears(row, zapModels) {
  const sameName = zapModels.filter(
    (candidate) => candidate.name_normalized === normalize(row.name),
  );
  const candidates = row.generation
    ? sameName.filter((candidate) =>
        generationsOverlap(row.generation, candidate.generation),
      )
    : sameName;
  if (candidates.length === 0) return { yearFrom: null, yearTo: null };

  const ranges = [
    ...new Set(
      candidates.map(
        (candidate) =>
          `${candidate.year_from ?? ""}|${candidate.year_to ?? ""}`,
      ),
    ),
  ];
  if (ranges.length !== 1) return { yearFrom: null, yearTo: null };
  const [yearFrom, yearTo] = ranges[0].split("|");
  return {
    yearFrom: yearFrom ? Number(yearFrom) : null,
    yearTo: yearTo ? Number(yearTo) : null,
  };
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
const rows = parseRows(raw);
if (rows.length === 0) throw new Error("В fixture не найдено моделей.");

const catalogVersion = createHash("sha256")
  .update(raw)
  .digest("hex")
  .slice(0, 16);
const makeNames = [
  ...new Map(rows.map((row) => [normalize(row.make), row.make])).values(),
];
const makes = makeNames.map((name) => ({
  source: "armtek",
  source_id: null,
  name: name.trim(),
  name_ru: null,
  name_normalized: normalize(name),
  name_ru_normalized: null,
  catalog_version: catalogVersion,
  updated_at: new Date().toISOString(),
}));

let armtekMakes;
let zapMakeRows = [];
if (dryRun) {
  armtekMakes = makes.map((make, index) => ({
    id: index + 1,
    name: make.name,
    name_normalized: make.name_normalized,
  }));
} else {
  await supabaseRequest(
    "vehicle_catalog_makes?on_conflict=source%2Cname_normalized",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(makes),
    },
  );
  armtekMakes = await supabaseRequest(
    "vehicle_catalog_makes?select=id,name,name_normalized&source=eq.armtek",
  ).then((response) => response.json());
  zapMakeRows = await supabaseRequest(
    "vehicle_catalog_makes?select=id,name_normalized&source=eq.zap.by",
  ).then((response) => response.json());
}

const armtekMakeByName = new Map(
  armtekMakes.map((make) => [make.name_normalized, make]),
);
const zapModelsByMakeId = new Map();
if (!dryRun) {
  await Promise.all(
    zapMakeRows.map(async (make) => {
      const models = await supabaseRequest(
        `vehicle_catalog_models?select=name_normalized,generation,year_from,year_to&source=eq.zap.by&make_id=eq.${make.id}`,
      ).then((response) => response.json());
      zapModelsByMakeId.set(make.name_normalized, models);
    }),
  );
}

const models = rows.map((row) => {
  const make = armtekMakeByName.get(normalize(row.make));
  if (!make && !dryRun) {
    throw new Error(`Не найдена марка Armtek ${row.make}.`);
  }
  const zapMakeNameNormalized = zapMakeName(row.make);
  const zapMake = zapMakeRows.find(
    (candidate) => candidate.name_normalized === zapMakeNameNormalized,
  );
  const years = dryRun
    ? { yearFrom: null, yearTo: null }
    : inferYears(row, zapModelsByMakeId.get(zapMake?.name_normalized) ?? []);
  const nameNormalized = normalize(row.name);
  const generationNormalized = normalize(row.generation ?? "");
  const key = [
    "armtek",
    make?.id ?? normalize(row.make),
    nameNormalized,
    generationNormalized,
  ].join("|");
  return {
    make_id: make?.id ?? null,
    source: "armtek",
    catalog_key: createHash("sha256").update(key).digest("hex"),
    name: row.name,
    name_normalized: nameNormalized,
    generation: sqlSafeValue(row.generation),
    body_type: null,
    year_from: years.yearFrom,
    year_to: years.yearTo,
    catalog_version: catalogVersion,
    updated_at: new Date().toISOString(),
  };
});

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
      source: "armtek",
      makes: makeNames.length,
      catalogVersion,
      models: models.length,
    },
    null,
    2,
  ),
);
