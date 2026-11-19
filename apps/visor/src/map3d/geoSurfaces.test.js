// geoSurfaceRings: blueprint shapes → local meters, checked against a calibration
// whose answer is known (the blueprint square laid on a ~333 m geo square).
import { describe, expect, test } from 'vitest';
import { makeProjection } from './ground.js';
import { geoAmenityItems, geoHomography, geoSurfaceRings, geoTextItems, lotGeoRing } from './geoSurfaces.js';

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
const projection = makeProjection(LAT, LNG);
const { toLocal } = projection;

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
    expect(geoSurfaceRings(s, [], projection)).toEqual({ manzanas: [], calles: [], verdes: [], aguas: [], perimetros: [] });
    expect(geoSurfaceRings(null, PAIRS, projection)).toEqual({ manzanas: [], calles: [], verdes: [], aguas: [], perimetros: [] });
  });

  test('a manzana lands on its geo corners', () => {
    const s = { manzanas: [{ id: 'm', points: [[0, 1], [1, 1], [1, 0]] }], calles: [] };
    const [ring] = geoSurfaceRings(s, PAIRS, projection).manzanas;
    const sw = toLocal(LAT, LNG);
    const ne = toLocal(LAT + D, LNG + D);
    expect(ring[0][0]).toBeCloseTo(sw.x, 3);
    expect(ring[0][1]).toBeCloseTo(sw.z, 3);
    expect(ring[2][0]).toBeCloseTo(ne.x, 3);
    expect(ring[2][1]).toBeCloseTo(ne.z, 3);
  });

  test('a perímetro comes through as a plain ring in meters', () => {
    const s = { perimetros: [{ id: 'p', points: [[0, 1], [1, 1], [1, 0], [0, 0]] }] };
    const { perimetros } = geoSurfaceRings(s, PAIRS, projection);
    expect(perimetros).toHaveLength(1);
    expect(perimetros[0]).toHaveLength(4);
    expect(perimetros[0][2][0]).toBeCloseTo(toLocal(LAT + D, LNG + D).x, 3);
  });

  test('a calle keeps its width in meters', () => {
    // Horizontal axis across the middle of the blueprint, 10 m wide.
    const s = { manzanas: [], calles: [{ id: 'c', axis: [[0.2, 0.5], [0.8, 0.5]], width: 10 }] };
    const { calles } = geoSurfaceRings(s, PAIRS, projection);
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
    expect(geoSurfaceRings(s, PAIRS, projection).calles).toHaveLength(1);
  });

  test('a verde crossed by a calle comes out in two pieces, off the lots too', () => {
    const s = {
      calles: [{ id: 'c', axis: [[0.5, 0], [0.5, 1]], width: 10 }],
      verdes: [{ id: 'v', points: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]] }],
    };
    const lot = [[0.25, 0.25], [0.35, 0.25], [0.35, 0.35], [0.25, 0.35]];
    const { verdes, aguas } = geoSurfaceRings(s, PAIRS, projection, [lot]);
    expect(aguas).toEqual([]);
    expect(verdes).toHaveLength(2);
    // The lot sits inside the west piece: it leaves a hole, in meters.
    const holes = verdes.flatMap(p => p.holes);
    expect(holes).toHaveLength(1);
    const xs = holes[0].map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(toLocal(LAT, LNG + 0.25 * D).x, 0);
  });
});

describe('geoTextItems', () => {
  test('places each text at its blueprint point, in meters, keeping the rest', () => {
    const s = { textos: [{ id: 't', point: [1, 1], text: 'Calle 1', size: 8, angle: 30 }, { id: 'sin-punto', text: 'x' }] };
    const items = geoTextItems(s, PAIRS, toLocal);
    expect(items).toHaveLength(1);
    // Blueprint (1, 1) is the SE corner of the calibration square.
    const se = toLocal(LAT, LNG + D);
    expect(items[0].x).toBeCloseTo(se.x, 3);
    expect(items[0].z).toBeCloseTo(se.z, 3);
    expect(items[0]).toMatchObject({ id: 't', text: 'Calle 1', size: 8, angle: 30 });
  });

  test('nothing without calibration or texts', () => {
    expect(geoTextItems({ textos: [{ point: [0, 0], text: 'a', size: 5 }] }, [], toLocal)).toEqual([]);
    expect(geoTextItems(null, PAIRS, toLocal)).toEqual([]);
  });
});

describe('geoAmenityItems', () => {
  test('brings the outline and the label point to meters, keeping the rest', () => {
    const amenity = { id: 'a', points: [[0, 1], [1, 1], [1, 0], [0, 0]], form: 'cancha', sport: 'padel', name: 'Pádel' };
    const [item] = geoAmenityItems({ amenities: [amenity] }, PAIRS, toLocal);
    const sw = toLocal(LAT, LNG);
    expect(item.ring[0][0]).toBeCloseTo(sw.x, 6);
    expect(item.ring[0][1]).toBeCloseTo(sw.z, 6);
    // Label in the middle of the square, i.e. the middle of its geo corners.
    const mid = toLocal(LAT + D / 2, LNG + D / 2);
    expect(item.label[0]).toBeCloseTo(mid.x, 0);
    expect(item.label[1]).toBeCloseTo(mid.z, 0);
    expect(item).toMatchObject({ id: 'a', form: 'cancha', sport: 'padel', name: 'Pádel' });
  });

  test('nothing without calibration, and skips outlines under 3 points', () => {
    const amenities = [{ id: 'a', points: [[0, 0], [1, 0], [1, 1]] }];
    expect(geoAmenityItems({ amenities }, [], toLocal)).toEqual([]);
    expect(geoAmenityItems({ amenities: [{ id: 'b', points: [[0, 0], [1, 0]] }] }, PAIRS, toLocal)).toEqual([]);
    expect(geoAmenityItems(null, PAIRS, toLocal)).toEqual([]);
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
