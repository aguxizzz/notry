// Calles y manzanas geo: el contorno de una calle tiene que tener el ancho en
// metros reales del terreno aunque el plano esté estirado.
import { describe, expect, it } from 'vitest';
import { computeHomography, invertHomography } from './homography.js';
import {
  addSurface, blueprintToGeo, calleRing, findSurfaceAt, geoToBlueprint, removeSurface, surfaceRings,
} from './geoSurfaces.js';

// Plano [0,1]² sobre un rectángulo de ~400 m × ~200 m en Misiones: el plano
// queda estirado 2:1 respecto del terreno, a propósito.
const LAT = -27.6;
const LNG = -55.3;
const dLat = 200 / 111320;
const dLng = 400 / (111320 * Math.cos((LAT * Math.PI) / 180));
const H = computeHomography([
  { src: [0, 0], dst: [LNG, LAT + dLat] },
  { src: [1, 0], dst: [LNG + dLng, LAT + dLat] },
  { src: [1, 1], dst: [LNG + dLng, LAT] },
  { src: [0, 1], dst: [LNG, LAT] },
]);
const Hinv = invertHomography(H);

const metersBetween = ([la1, ln1], [la2, ln2]) => Math.hypot(
  (la2 - la1) * 111320,
  (ln2 - ln1) * 111320 * Math.cos((LAT * Math.PI) / 180),
);

describe('blueprint ↔ geo', () => {
  it('vuelve al mismo punto del plano', () => {
    const p = [0.3, 0.7];
    const [x, y] = geoToBlueprint(Hinv, blueprintToGeo(H, p));
    expect(x).toBeCloseTo(0.3, 9);
    expect(y).toBeCloseTo(0.7, 9);
  });
});

describe('calleRing', () => {
  it('tiene el ancho en metros en el terreno, en una calle horizontal y en una vertical', () => {
    for (const axis of [[[0.2, 0.5], [0.8, 0.5]], [[0.5, 0.2], [0.5, 0.8]]]) {
      const ring = calleRing({ axis, width: 12 }, H, Hinv);
      // Recta: 2 puntos por lado; ring[0] y ring[3] son los dos bordes en el inicio.
      expect(ring).toHaveLength(4);
      const width = metersBetween(blueprintToGeo(H, ring[0]), blueprintToGeo(H, ring[3]));
      expect(width).toBeCloseTo(12, 3);
    }
  });

  it('sin eje suficiente no hay contorno', () => {
    expect(calleRing({ axis: [[0.1, 0.1]], width: 12 }, H, Hinv)).toEqual([]);
  });
});

describe('shapes', () => {
  const base = { manzanas: [], calles: [] };

  it('no agrega una manzana con menos de 3 puntos ni una calle con menos de 2', () => {
    expect(addSurface(base, { kind: 'manzana', points: [[0, 0], [1, 0]] })).toBe(base);
    expect(addSurface(base, { kind: 'calle', points: [[0, 0]], width: 12 })).toBe(base);
  });

  it('encuentra la calle antes que la manzana de abajo, y borra por id', () => {
    let s = addSurface(base, { kind: 'manzana', id: 'm', points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] });
    s = addSurface(s, { kind: 'calle', id: 'c', points: [[0.2, 0.5], [0.8, 0.5]], width: 12 });
    const rings = surfaceRings(s, H, Hinv);
    expect(findSurfaceAt(rings, [0.5, 0.5])).toEqual({ kind: 'calle', id: 'c' });
    expect(findSurfaceAt(rings, [0.5, 0.2])).toEqual({ kind: 'manzana', id: 'm' });
    expect(findSurfaceAt(rings, [0.95, 0.95])).toBeNull();
    expect(removeSurface(s, { kind: 'calle', id: 'c' }).calles).toEqual([]);
  });
});
