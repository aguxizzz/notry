// Superficies geo (manzanas, calles, verdes, agua, perímetro): el contorno de
// una calle tiene que tener el ancho en metros reales del terreno aunque el
// plano esté estirado.
import { describe, expect, it } from 'vitest';
import { computeHomography, invertHomography } from './homography.js';
import {
  DEFAULT_NATURAL_SHAPE, addSurface, blueprintToGeo, calleRing, displayRings, findSurfaceAt, geoToBlueprint, normalizeGeoSurfaces,
  removeSurface, snapToAxis, surfaceRings,
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

  it('verde, agua y perímetro van cada uno a su lista, aunque el loteo no las traiga', () => {
    const square = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]];
    let s = addSurface(base, { kind: 'verde', id: 'v', points: square });
    s = addSurface(s, { kind: 'agua', id: 'a', points: square });
    s = addSurface(s, { kind: 'perimetro', id: 'p', points: square });
    // Verdes y agua nacen con la forma por defecto del borde; el perímetro no la usa.
    expect(s.verdes).toEqual([{ id: 'v', points: square, ...DEFAULT_NATURAL_SHAPE }]);
    expect(s.aguas).toEqual([{ id: 'a', points: square, ...DEFAULT_NATURAL_SHAPE }]);
    expect(s.perimetros).toEqual([{ id: 'p', points: square }]);
    expect(removeSurface(s, { kind: 'agua', id: 'a' }).aguas).toEqual([]);
  });

  it('el perímetro se agarra por el borde, no por adentro', () => {
    const s = addSurface(base, { kind: 'perimetro', id: 'p', points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] });
    const rings = surfaceRings(s, H, Hinv);
    expect(findSurfaceAt(rings, [0.5, 0.5])).toBeNull();
    expect(findSurfaceAt(rings, [0.5, 0.105])).toEqual({ kind: 'perimetro', id: 'p' });
  });
});

describe('normalizeGeoSurfaces', () => {
  it('completa con listas vacías lo que un loteo viejo no trae', () => {
    expect(normalizeGeoSurfaces({ manzanas: [{ id: 'm' }] })).toEqual({
      manzanas: [{ id: 'm' }], calles: [], verdes: [], aguas: [], perimetros: [],
    });
  });
});

describe('conexiones entre calles', () => {
  const base = { manzanas: [], calles: [] };
  const calle = (s, id, points) => addSurface(s, { kind: 'calle', id, points, width: 12 });

  it('dos calles que se cruzan se pintan como un solo contorno', () => {
    let s = calle(base, 'h', [[0.2, 0.5], [0.8, 0.5]]);
    s = calle(s, 'v', [[0.5, 0.2], [0.5, 0.8]]);
    const shown = displayRings(surfaceRings(s, H, Hinv));
    expect(shown).toHaveLength(1);
    expect(shown[0].holes).toEqual([]);
    // Para elegir cuál editar siguen siendo dos.
    expect(s.calles).toHaveLength(2);
  });

  it('una grilla conserva la manzana encerrada como agujero, no como calle', () => {
    let s = calle(base, 'a', [[0.1, 0.3], [0.9, 0.3]]);
    s = calle(s, 'b', [[0.1, 0.7], [0.9, 0.7]]);
    s = calle(s, 'c', [[0.3, 0.1], [0.3, 0.9]]);
    s = calle(s, 'd', [[0.7, 0.1], [0.7, 0.9]]);
    const shown = displayRings(surfaceRings(s, H, Hinv));
    expect(shown).toHaveLength(1);
    expect(shown[0].holes).toHaveLength(1);
  });

  it('una calle que arranca en la punta de otra la continúa', () => {
    let s = calle(base, 'h', [[0.2, 0.5], [0.5, 0.5]]);
    const start = snapToAxis(s, [0.505, 0.502]);
    expect(start).toEqual([0.5, 0.5]);
    s = calle(s, 'v', [start, [0.5, 0.9]]);
    expect(s.calles).toHaveLength(1);
    expect(s.calles[0].axis).toEqual([[0.2, 0.5], [0.5, 0.5], [0.5, 0.9]]);
  });

  it('lejos de cualquier eje el click queda donde cayó', () => {
    const s = calle(base, 'h', [[0.2, 0.5], [0.5, 0.5]]);
    expect(snapToAxis(s, [0.6, 0.6])).toEqual([0.6, 0.6]);
  });
});
