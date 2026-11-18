// outsidePerimeter: the area the perímetro's veil covers (everything but the loteo).
import { describe, expect, test } from 'vitest';
import { outsidePerimeter } from './surfaceLayer.js';

const square = (x, z, size) => [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];

describe('outsidePerimeter', () => {
  test('one perímetro leaves one hole in the world square', () => {
    const outside = outsidePerimeter([square(0, 0, 100)], 1000);
    expect(outside).toHaveLength(1);
    expect(outside[0].holes).toHaveLength(1);
  });

  test('two overlapping perímetros make a single hole, not a double veil', () => {
    const outside = outsidePerimeter([square(0, 0, 100), square(50, 0, 100)], 1000);
    expect(outside).toHaveLength(1);
    expect(outside[0].holes).toHaveLength(1);
    const xs = outside[0].holes[0].map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(150);
  });
});
