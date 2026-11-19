// Tests for the building file ↔ saved building diff (buildingSync.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffBuildingUnits } from './buildingSync.js';

const building = {
  floors: [
    { code: '3', units: [
      { id: 'u3a', code: '3A', status: 'available', ambientes: 4, covered_m2: '130.19', semi_m2: null },
      { id: 'u3b', code: '3B', status: 'available', ambientes: 2, covered_m2: '50.72', semi_m2: '3.80' },
    ] },
    { code: '10', units: [{ id: 'u10b', code: '10B', status: 'available' }] },
    { code: '11', units: [{ id: 'u11a', code: '11A', status: 'available' }] },
  ],
};

const file = {
  floors: [
    { code: '3', units: [
      { code: '3A', status: 'sold', ambientes: 4, covered_m2: 130.19, semi_m2: 9.51, price_usd: 1, _nota: 'x' },
      { code: '3B', status: 'available', ambientes: 2, covered_m2: 50.72, semi_m2: 3.8 },
    ] },
    { code: '10', units: [{ code: '10A', status: 'reserved' }] },
    { code: '12', units: [{ code: '12A', status: 'sold' }] },
  ],
};

test('only changed fields go in the diff, and decimals compare as numbers', () => {
  const diff = diffBuildingUnits(building, file);
  assert.deepEqual(diff.changes, [
    { code: '3A', file_code: '3A', unit_id: 'u3a', before: { status: 'available', semi_m2: null }, after: { status: 'sold', semi_m2: 9.51 } },
  ]);
  assert.deepEqual(diff.unchanged, ['3B']);
});

test('unmatched codes are reported on each side and unknown fields are listed', () => {
  const diff = diffBuildingUnits(building, file);
  assert.deepEqual(diff.only_in_file, ['10A', '12A']);
  assert.deepEqual(diff.only_in_building, ['10B', '11A']);
  assert.deepEqual(diff.ignored_fields, ['price_usd']);
});

test('code_map pairs a file code with a differently named unit', () => {
  const diff = diffBuildingUnits(building, file, { '10A': '10b' });
  assert.ok(diff.changes.some(c => c.unit_id === 'u10b' && c.after.status === 'reserved' && c.file_code === '10A'));
  assert.deepEqual(diff.only_in_building, ['11A']);
});
