// Plans which photos each unit of a building gets, from groups of "these files go to these
// unit codes" (usually one group per unit type). Pure: the server uploads the files and
// saves the resulting URLs in each unit's image_urls.

// Same normalization as buildingSync, so "3a" and "3-A" find unit 3A.
const normCode = code => String(code).toUpperCase().replace(/[\s_-]/g, '');

/**
 * groups: [{ unit_codes: [...], image_paths: [...] }].
 * A unit listed in several groups gets the photos of all of them, in group order and without
 * repeating a path. Returns one entry per unit that gets photos (with its current URLs), the
 * distinct paths to upload (each one once, even if several units share it) and the codes
 * that matched no unit.
 */
export function planUnitImages(building, groups) {
  const units = new Map();
  for (const floor of building.floors ?? []) {
    for (const unit of floor.units ?? []) units.set(normCode(unit.code), unit);
  }

  const byUnit = new Map();
  const unknownCodes = [];
  for (const { unit_codes, image_paths } of groups) {
    for (const code of unit_codes) {
      const unit = units.get(normCode(code));
      if (!unit) {
        if (!unknownCodes.includes(code)) unknownCodes.push(code);
        continue;
      }
      const entry = byUnit.get(unit.id) ?? { unit_id: unit.id, code: unit.code, current: unit.image_urls ?? [], paths: [] };
      for (const path of image_paths) if (!entry.paths.includes(path)) entry.paths.push(path);
      byUnit.set(unit.id, entry);
    }
  }

  const entries = [...byUnit.values()];
  const paths = [...new Set(entries.flatMap(e => e.paths))];
  return { units: entries, paths, unknown_codes: unknownCodes };
}

/**
 * Final image_urls of a unit. "replace" leaves only the new photos, so running the same
 * plan twice ends the same; "append" keeps the current ones first and adds the new ones after.
 */
export function nextImageUrls(current, uploaded, mode) {
  return mode === 'append' ? [...current, ...uploaded] : [...uploaded];
}
