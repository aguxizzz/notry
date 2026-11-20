// Tests for the unit photo plan: matching codes, sharing uploads between units and replace/append.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextImageUrls, planUnitImages } from './unitImages.js';

const building = {
  floors: [
    { code: '3', units: [{ id: 'u3a', code: '3A', image_urls: ['https://old/1.jpg'] }, { id: 'u3b', code: '3B' }] },
    { code: '4', units: [{ id: 'u4a', code: '4A' }] },
  ],
};

test('matches codes loosely and uploads a shared photo once', () => {
  const plan = planUnitImages(building, [
    { unit_codes: ['3a', '4-A'], image_paths: ['/f/living.jpg', '/f/cocina.jpg'] },
    { unit_codes: ['3B'], image_paths: ['/f/living.jpg'] },
  ]);
  assert.deepEqual(plan.paths, ['/f/living.jpg', '/f/cocina.jpg']);
  assert.deepEqual(plan.units.map(u => u.code), ['3A', '4A', '3B']);
  assert.deepEqual(plan.units[0].current, ['https://old/1.jpg']);
  assert.deepEqual(plan.units[2].current, []);
  assert.deepEqual(plan.unknown_codes, []);
});

test('a unit in two groups gets both, in order and without repeats', () => {
  const plan = planUnitImages(building, [
    { unit_codes: ['3A'], image_paths: ['/f/a.jpg', '/f/b.jpg'] },
    { unit_codes: ['3A'], image_paths: ['/f/b.jpg', '/f/dorm.jpg'] },
  ]);
  assert.deepEqual(plan.units[0].paths, ['/f/a.jpg', '/f/b.jpg', '/f/dorm.jpg']);
});

test('reports codes with no unit and skips them', () => {
  const plan = planUnitImages(building, [{ unit_codes: ['3A', '99Z', '99Z'], image_paths: ['/f/a.jpg'] }]);
  assert.deepEqual(plan.unknown_codes, ['99Z']);
  assert.equal(plan.units.length, 1);
});

test('replace drops the current photos, append keeps them first', () => {
  assert.deepEqual(nextImageUrls(['old'], ['new'], 'replace'), ['new']);
  assert.deepEqual(nextImageUrls(['old'], ['new'], 'append'), ['old', 'new']);
});
