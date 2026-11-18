// Clear area of the fog corridor toward a far POI (poiCorridor.js).
import { describe, expect, it } from 'vitest';
import { corridorShape, fogAt } from './poiCorridor.js';

describe('fogAt', () => {
  // POI 5 km east of the loteo; loteo disk of 400 m.
  const shape = corridorShape({ x: 5000, z: 0 }, 400);

  it('is clear at the loteo, along the lane and at the place', () => {
    expect(fogAt(shape, 0, 0)).toBe(0);
    expect(fogAt(shape, 2500, 0)).toBe(0);
    expect(fogAt(shape, 5000, 0)).toBe(0);
  });

  it('is fogged away from all three zones', () => {
    expect(fogAt(shape, 2500, 3000)).toBe(1); // beside the lane
    expect(fogAt(shape, -3000, 0)).toBe(1); // behind the loteo
    expect(fogAt(shape, 8000, 0)).toBe(1); // past the place
  });

  it('fades over the lane feather instead of cutting', () => {
    const edge = shape.lane.half + shape.lane.feather / 2;
    const v = fogAt(shape, 2500, edge);
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(0.8);
  });

  it('widens the lane with distance, within limits', () => {
    expect(corridorShape({ x: 1000, z: 0 }, 0).lane.half).toBe(180);
    expect(corridorShape({ x: 60000, z: 0 }, 0).lane.half).toBe(600);
  });
});
