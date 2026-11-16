// geoSurfaceRings: blueprint shapes → local meters, checked against a calibration
// whose answer is known (the blueprint square laid on a ~333 m geo square).
import { describe, expect, test } from 'vitest';
import { makeProjection } from './ground.js';
import { geoHomography, geoSurfaceRings, lotGeoRing } from './geoSurfaces.js';

const LAT = -27.61;
const LNG = -55.32;
// ~333 m of latitude. Not smaller: isHomographyValid rejects a 2×2 determinant
// under 1e-6, which in degrees means a blueprint of ~110 m or less.
const D = 0.003;
// Blueprint y grows downward, latitude upward: (0,0) is the NW corner.
const PAIRS = [
  { blueprint: [0, 0], geo: [LAT + D, LNG] },
  { blueprint: [1, 0], geo: [LAT + D, LNG + D] },
  { blueprint: [1, 1], geo: [LAT, LNG + D] },
  { blueprint: [0, 1], geo: [LAT, LNG] },
];
const { toLocal } = makeProjection(LAT, LNG);

describe('geoHomography', () => {
  test('needs 4 pairs', () => {
    expect(geoHomography(PAIRS.slice(0, 3))).toBeNull();
    expect(geoHomography(null)).toBeNull();
    expect(geoHomography(PAIRS)).not.toBeNull();
  });
});

describe('geoSurfaceRings', () => {
  test('nothing without calibration or surfaces', () => {
    const s = { manzanas: [{ id: 'm', points: [[0, 0], [1, 0], [1, 1]] }], calles: [] };
    expect(geoSurfaceRings(s, [], toLocal)).toEqual({ manzanas: [], calles: [] });
    expect(geoSurfaceRings(null, PAIRS, toLocal)).toEqual({ manzanas: [], calles: [] });
  });

  test('a manzana lands on its geo corners', () => {
    const s = { manzanas: [{ id: 'm', points: [[0, 1], [1, 1], [1, 0]] }], calles: [] };
    const [ring] = geoSurfaceRings(s, PAIRS, toLocal).manzanas;
    const sw = toLocal(LAT, LNG);
    const ne = toLocal(LAT + D, LNG + D);
    expect(ring[0][0]).toBeCloseTo(sw.x, 3);
    expect(ring[0][1]).toBeCloseTo(sw.z, 3);
    expect(ring[2][0]).toBeCloseTo(ne.x, 3);
    expect(ring[2][1]).toBeCloseTo(ne.z, 3);
  });

  test('a calle keeps its width in meters', () => {
    // Horizontal axis across the middle of the blueprint, 10 m wide.
    const s = { manzanas: [], calles: [{ id: 'c', axis: [[0.2, 0.5], [0.8, 0.5]], width: 10 }] };
    const { calles } = geoSurfaceRings(s, PAIRS, toLocal);
    expect(calles).toHaveLength(1);
    const zs = calles[0].outer.map(([, z]) => z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(10, 1);
  });

  test('two crossing calles merge into one network', () => {
    const s = {
      manzanas: [],
      calles: [
        { id: 'a', axis: [[0.2, 0.5], [0.8, 0.5]], width: 10 },
        { id: 'b', axis: [[0.5, 0.2], [0.5, 0.8]], width: 10 },
      ],
    };
    expect(geoSurfaceRings(s, PAIRS, toLocal).calles).toHaveLength(1);
  });
});

describe('lotGeoRing', () => {
  const stale = [[1, 1], [1, 2], [2, 2]];

  test('places the lot from its blueprint outline, not the saved geo_coordinates', () => {
    const ring = lotGeoRing(PAIRS)({ blueprint_coordinates: [[0, 1], [1, 1], [1, 0]], geo_coordinates: stale });
    expect(ring[0][0]).toBeCloseTo(LAT, 9);
    expect(ring[0][1]).toBeCloseTo(LNG, 9);
    expect(ring[2][0]).toBeCloseTo(LAT + D, 9);
  });

  test('falls back to geo_coordinates without calibration or blueprint outline', () => {
    expect(lotGeoRing([])({ blueprint_coordinates: [[0, 0], [1, 0], [1, 1]], geo_coordinates: stale })).toBe(stale);
    expect(lotGeoRing(PAIRS)({ geo_coordinates: stale })).toBe(stale);
    expect(lotGeoRing(PAIRS)({})).toBeNull();
  });
});
