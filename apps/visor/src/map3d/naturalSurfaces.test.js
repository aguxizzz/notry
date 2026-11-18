// The shore field the water shader reads: ~0.5 on the shore, near 1 deep
// inside, 0 outside, with holes (a lot inside the water) counting as outside.
import { describe, expect, test } from 'vitest';
import { bakeShoreField } from './naturalSurfaces.js';

const square = (x0, z0, side) => [[x0, z0], [x0 + side, z0], [x0 + side, z0 + side], [x0, z0 + side]];

/** Field value (0..1) at a point in meters. */
function sample({ data, width, height, box }, [x, z]) {
  const i = Math.floor((x - box[0]) * box[2] * width);
  const j = Math.floor((z - box[1]) * box[3] * height);
  return data[(j * width + i) * 4] / 255;
}

describe('bakeShoreField', () => {
  test('nothing to bake without shapes', () => {
    expect(bakeShoreField([])).toBeNull();
  });

  test('water: deep in the middle, half on the shore, nothing outside', () => {
    const field = bakeShoreField([{ outer: square(0, 0, 100), holes: [] }]);
    expect(sample(field, [50, 50])).toBeGreaterThan(0.97);
    expect(sample(field, [0.3, 50])).toBeCloseTo(0.5, 1);
    // Outside it fades away (never drawn there, the mesh ends at the shore).
    expect(sample(field, [-3, 50])).toBeLessThan(0.4);
    expect(sample(field, [-8, 50])).toBeLessThan(sample(field, [-3, 50]));
  });

  test('a hole counts as outside', () => {
    // Sized well past the ~16 m the blur reaches, so the middles are clean.
    const field = bakeShoreField([{ outer: square(0, 0, 200), holes: [square(60, 60, 80)] }]);
    expect(sample(field, [100, 100])).toBeLessThan(0.05);
    expect(sample(field, [30, 30])).toBeGreaterThan(0.97);
  });

  test('a long strip of shapes stays under the size cap', () => {
    const field = bakeShoreField([{ outer: [[0, 0], [3000, 0], [3000, 10], [0, 10]], holes: [] }]);
    expect(field.width).toBeLessThanOrEqual(1024);
  });
});
