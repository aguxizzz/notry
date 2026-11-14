// Tests for the plano geometry helpers (run with `npm test`, Node's built-in runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centroid, median, polygonArea } from './geometry.js';

const SQUARE = [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]];

test('area is the same clockwise and counter-clockwise', () => {
  assert.equal(polygonArea(SQUARE), 0.25);
  assert.equal(polygonArea([...SQUARE].reverse()), 0.25);
});

test('centroid of a square is its middle', () => {
  assert.deepEqual(centroid(SQUARE), [0.25, 0.25]);
});

test('median ignores missing values', () => {
  assert.equal(median([3, null, 1, NaN, 2]), 2);
  assert.equal(median([]), null);
});
