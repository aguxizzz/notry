// Compares a building's data file (the JSON put together from the developer's price list)
// with what notry-back has saved for that building, so the MCP can show the changes before
// writing them. Pure functions: the server does the I/O.

// Unit fields the file can set. They match the back's UnitUpdate, so a diff entry is a PATCH body as-is.
// `price_usd` is also read, but it goes into `pricing` (see below).
export const UNIT_FIELDS = ['status', 'ambientes', 'dormitorios', 'banos', 'total_m2', 'covered_m2', 'semi_m2'];
const NUMERIC = new Set([...UNIT_FIELDS.filter(f => f !== 'status'), 'price']);

// Same normalization on both sides, so "AB-10a" and "ab10A" count as the same code.
const normCode = code => String(code).toUpperCase().replace(/[\s_-]/g, '');

// The back sends decimals as strings ("50.72") and the file as numbers: compare as numbers,
// rounded to the 2 decimals the column keeps.
function sameValue(field, saved, wanted) {
  if (!NUMERIC.has(field)) return saved === wanted;
  if (saved == null || wanted == null) return saved == wanted;
  return Math.round(Number(saved) * 100) === Math.round(Number(wanted) * 100);
}

/**
 * Diff between the file and the saved building.
 * `codeMap` maps file codes to building codes for units that were named differently in the
 * editor (e.g. { "10A": "10B" }). Fields missing from the file are left alone, never cleared.
 * Returns the units to change (with only the changed fields), the ones already up to date,
 * the codes that only exist on one side, and the file fields that have nowhere to go.
 */
export function diffBuildingUnits(building, file, codeMap = {}) {
  const saved = new Map();
  for (const floor of building.floors ?? []) {
    for (const unit of floor.units ?? []) saved.set(normCode(unit.code), { ...unit, floor_code: floor.code });
  }
  const mapped = Object.fromEntries(Object.entries(codeMap).map(([from, to]) => [normCode(from), normCode(to)]));

  const changes = [];
  const unchanged = [];
  const onlyInFile = [];
  const ignoredFields = new Set();
  const matched = new Set();

  for (const floor of file.floors ?? []) {
    for (const wanted of floor.units ?? []) {
      const key = mapped[normCode(wanted.code)] ?? normCode(wanted.code);
      const unit = saved.get(key);
      if (!unit) {
        onlyInFile.push(wanted.code);
        continue;
      }
      matched.add(key);
      // Keys starting with "_" are notes for people; anything else unknown is reported, not sent.
      for (const field of Object.keys(wanted)) {
        if (field !== 'code' && field !== 'price_usd' && !field.startsWith('_') && !UNIT_FIELDS.includes(field)) ignoredFields.add(field);
      }
      const fields = {};
      const before = {};
      for (const field of UNIT_FIELDS) {
        if (!(field in wanted) || sameValue(field, unit[field], wanted[field])) continue;
        fields[field] = wanted[field];
        before[field] = unit[field] ?? null;
      }
      // Price lives in the unit's free-form `pricing` JSON, the same place editor-deptos's
      // "Precio (USD)" writes to: only `amount` changes, any other key in it is kept.
      if ('price_usd' in wanted && !sameValue('price', unit.pricing?.amount ?? null, wanted.price_usd)) {
        fields.pricing = { ...(unit.pricing || {}), amount: wanted.price_usd, currency: 'USD' };
        before.pricing = unit.pricing ?? null;
      }
      const entry = { code: unit.code, file_code: wanted.code, unit_id: unit.id };
      if (Object.keys(fields).length) changes.push({ ...entry, before, after: fields });
      else unchanged.push(unit.code);
    }
  }

  const onlyInBuilding = [...saved.entries()].filter(([key]) => !matched.has(key)).map(([, u]) => u.code);
  return { changes, unchanged, only_in_file: onlyInFile, only_in_building: onlyInBuilding, ignored_fields: [...ignoredFields].sort() };
}
