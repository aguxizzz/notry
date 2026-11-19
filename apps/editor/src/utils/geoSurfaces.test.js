// Superficies geo (manzanas, calles, verdes, agua, perímetro): el contorno de
// una calle tiene que tener el ancho en metros reales del terreno aunque el
// plano esté estirado.
import { describe, expect, it } from 'vitest';
import { computeHomography, invertHomography } from './homography.js';
import {
  DEFAULT_NATURAL_SHAPE, addSurface, addText, blueprintToGeo, calleAngleAt, calleRing, displayRings, findSurfaceAt,
  findTextAt, geoToBlueprint, normalizeGeoSurfaces, normalizeTextAngle, removeSurface, snapToAxis, surfaceRings,
  pasteText, withoutEmptyTexts, wrapTextAngle,
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

  it('con shapes superpuestas gana lo de adentro: lote y agua, después verde, la manzana al fondo', () => {
    // Una manzana grande con un verde adentro, un espejo de agua dentro del
    // verde y un lote en otra esquina de la manzana. El orden de la lista
    // es el de pintado (manzana primero), a propósito.
    const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const rings = [
      { kind: 'manzana', id: 'm', ring: box(0, 0, 1, 1), holes: [] },
      { kind: 'verde', id: 'v', ring: box(0.1, 0.1, 0.5, 0.5), holes: [] },
      { kind: 'agua', id: 'a', ring: box(0.2, 0.2, 0.3, 0.3), holes: [] },
      { kind: 'lote', id: 7, ring: box(0.7, 0.7, 0.9, 0.9), holes: [] },
    ];
    expect(findSurfaceAt(rings, [0.25, 0.25])).toEqual({ kind: 'agua', id: 'a' });
    expect(findSurfaceAt(rings, [0.4, 0.4])).toEqual({ kind: 'verde', id: 'v' });
    expect(findSurfaceAt(rings, [0.8, 0.8])).toEqual({ kind: 'lote', id: 7 });
    expect(findSurfaceAt(rings, [0.6, 0.2])).toEqual({ kind: 'manzana', id: 'm' });
  });
});

describe('normalizeGeoSurfaces', () => {
  it('completa con listas vacías lo que un loteo viejo no trae', () => {
    expect(normalizeGeoSurfaces({ manzanas: [{ id: 'm' }] })).toEqual({
      manzanas: [{ id: 'm' }], calles: [], verdes: [], aguas: [], perimetros: [], textos: [],
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

describe('textos', () => {
  // Sin canvas en los tests: cada letra mide lo mismo que el tamaño (en metros).
  const boxOf = (text, size) => ({ halfW: (text.length * size) / 2, halfH: size / 2 });

  it('normaliza el ángulo a (-90, 90]: una recta y su opuesta son el mismo texto', () => {
    expect(normalizeTextAngle(0)).toBe(0);
    expect(normalizeTextAngle(180)).toBe(0);
    expect(normalizeTextAngle(135)).toBe(-45);
    expect(normalizeTextAngle(-100)).toBe(80);
    expect(normalizeTextAngle(90)).toBe(90);
  });

  it('sobre una calle toma el ángulo del terreno, no el del plano estirado', () => {
    // Diagonal del plano: en el terreno (400 × 200 m) baja ~26,6° del este hacia el sur, no 45°.
    const surfaces = addSurface(normalizeGeoSurfaces(null), { kind: 'calle', points: [[0, 0], [1, 1]], width: 12, id: 'c1' });
    const calleRings = surfaceRings(surfaces, H, Hinv).filter(r => r.kind === 'calle');
    const angle = calleAngleAt(surfaces, calleRings, [0.5, 0.5], H);
    expect(angle).toBeCloseTo((Math.atan2(200, 400) * 180) / Math.PI, 0);
    // Lejos de la calle no hay ángulo: queda como nombre de zona.
    expect(calleAngleAt(surfaces, calleRings, [0.9, 0.1], H)).toBeNull();
  });

  it('un texto nuevo arranca sin contorno, con la fuente por defecto y el ángulo que se le pase', () => {
    const empty = normalizeGeoSurfaces(null);
    const [texto] = addText(empty, { point: [0.5, 0.5], angle: 30 }).surfaces.textos;
    expect(texto).toMatchObject({ angle: 30, font: 'moderna', outline: 'none', color: '#ffffff' });
    expect(addText(empty, { point: [0.5, 0.5] }).surfaces.textos[0].angle).toBeNull();
  });

  it('se clickea dentro de la caja girada del texto y no fuera', () => {
    // "ABCD" de 10 m: caja de 40 × 10 m. Horizontal (0°) en el centro del plano.
    const textos = [{ id: 't', point: [0.5, 0.5], text: 'ABCD', size: 10, angle: 0 }];
    const [lat, lng] = blueprintToGeo(H, [0.5, 0.5]);
    const at = (east, south) => geoToBlueprint(Hinv, [lat - south / 111320, lng + east / (111320 * Math.cos((LAT * Math.PI) / 180))]);
    expect(findTextAt(textos, at(18, 0), H, boxOf)).toBe('t');
    expect(findTextAt(textos, at(0, 18), H, boxOf)).toBeNull();
    // Girado 90°: ahora la caja va de norte a sur.
    const vertical = [{ ...textos[0], angle: 90 }];
    expect(findTextAt(vertical, at(0, 18), H, boxOf)).toBe('t');
    expect(findTextAt(vertical, at(18, 0), H, boxOf)).toBeNull();
  });

  it('el ángulo libre da la vuelta entera: (-180, 180]', () => {
    expect(wrapTextAngle(170 + 90)).toBe(-100);
    expect(wrapTextAngle(-180)).toBe(180);
    expect(wrapTextAngle(-90 - 90)).toBe(180);
    expect(wrapTextAngle(45)).toBe(45);
  });

  it('pegar pone una copia nueva corrida unos metros, con el mismo aspecto', () => {
    const original = { id: 't', point: [0.5, 0.5], text: 'Plaza', size: 10, angle: 30, font: 'mano', flipX: true };
    const { surfaces, id } = pasteText(normalizeGeoSurfaces(null), original, H, Hinv, 'copia');
    const [copy] = surfaces.textos;
    expect(id).toBe('copia');
    expect(copy).toMatchObject({ text: 'Plaza', angle: 30, font: 'mano', flipX: true });
    // 12 m al este y 12 al sur: ~17 m en diagonal, aunque el plano esté estirado 2:1.
    expect(metersBetween(blueprintToGeo(H, original.point), blueprintToGeo(H, copy.point))).toBeCloseTo(12 * Math.SQRT2, 0);
  });

  it('al guardar se descartan los textos vacíos', () => {
    const surfaces = { ...normalizeGeoSurfaces(null), textos: [{ id: 'a', text: '  ' }, { id: 'b', text: 'Plaza' }] };
    expect(withoutEmptyTexts(surfaces).textos.map(t => t.id)).toEqual(['b']);
  });
});
