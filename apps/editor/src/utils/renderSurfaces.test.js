import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RENDER_SURFACES, addDrawnShape, findShape, findSurfaceAtPoint, hasAnyShape, hasStreetPaths,
  minPointsFor, normalizeRenderSurfaces, removeShape, streetRibbon, surfacesForDirtyCheck, withStreetAxis,
  withStreetWidth,
} from './renderSurfaces.js';
import { buildStreetRibbon } from './streetPath.js';

const EMPTY = { manzanas: [], calles: [] };
// Sin calibración el contorno se arma directo en pixeles del panorama.
const NO_HOMOGRAPHY = null;

const street = (id, axis, width = 20) => ({ id, axis, width, points: buildStreetRibbon(axis, width) });

describe('normalizeRenderSurfaces', () => {
  test('null o basura: las superficies por defecto', () => {
    expect(normalizeRenderSurfaces(null)).toBe(DEFAULT_RENDER_SURFACES);
    expect(normalizeRenderSurfaces('x')).toBe(DEFAULT_RENDER_SURFACES);
  });

  test('completa los campos que falten', () => {
    expect(normalizeRenderSurfaces({ manzanas: [{ id: 'm' }] })).toEqual({
      ...DEFAULT_RENDER_SURFACES, manzanas: [{ id: 'm' }],
    });
  });
});

test('surfacesForDirtyCheck ignora las capas visibles', () => {
  const a = { ...DEFAULT_RENDER_SURFACES, layersVisible: { lotes: false, manzanas: true, calles: true } };
  expect(surfacesForDirtyCheck(a)).toEqual(surfacesForDirtyCheck(DEFAULT_RENDER_SURFACES));
});

test('mínimo de puntos: calle 2 (eje), manzana 3 (polígono)', () => {
  expect(minPointsFor('calle')).toBe(2);
  expect(minPointsFor('manzana')).toBe(3);
});

describe('addDrawnShape', () => {
  test('trazo corto no crea nada', () => {
    expect(addDrawnShape(EMPTY, { kind: 'manzana', drawingPts: [[0, 0], [1, 1]], id: 'm' })).toBeNull();
    expect(addDrawnShape(EMPTY, { kind: 'calle', drawingPts: [[0, 0]], streetWidth: 20, id: 'c' })).toBeNull();
  });

  test('manzana: guarda el polígono tal cual', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    const next = addDrawnShape(EMPTY, { kind: 'manzana', drawingPts: pts, id: 'm1' });
    expect(next.manzanas).toEqual([{ id: 'm1', points: pts }]);
    expect(next.calles).toBe(EMPTY.calles);
  });

  test('calle nueva: eje + ancho + contorno generado', () => {
    const axis = [[0, 0], [100, 0]];
    const next = addDrawnShape(EMPTY, { kind: 'calle', drawingPts: axis, streetWidth: 20, homography: NO_HOMOGRAPHY, id: 'c1' });
    expect(next.calles).toHaveLength(1);
    expect(next.calles[0]).toMatchObject({ id: 'c1', axis, width: 20 });
    expect(next.calles[0].points).toEqual(buildStreetRibbon(axis, 20));
  });

  test('arrancar cerca de la punta de otra Ruta la extiende en vez de crear otra', () => {
    const existing = { ...EMPTY, calles: [street('c1', [[0, 0], [100, 0]], 30)] };
    const next = addDrawnShape(existing, {
      kind: 'calle', drawingPts: [[103, 2], [100, 100]], streetWidth: 20, homography: NO_HOMOGRAPHY, id: 'c2',
    });
    expect(next.calles).toHaveLength(1);
    expect(next.calles[0].axis).toEqual([[0, 0], [100, 0], [100, 100]]);
    // Conserva el ancho de la Ruta existente, no el del selector
    expect(next.calles[0].width).toBe(30);
  });

  test('arrancar en un vértice interior: Ruta aparte que empieza exacto en el vértice', () => {
    const existing = { ...EMPTY, calles: [street('c1', [[0, 0], [100, 0], [200, 0]])] };
    const next = addDrawnShape(existing, {
      kind: 'calle', drawingPts: [[102, 3], [100, 100]], streetWidth: 20, homography: NO_HOMOGRAPHY, id: 'c2',
    });
    expect(next.calles).toHaveLength(2);
    expect(next.calles[1].axis).toEqual([[100, 0], [100, 100]]);
  });
});

describe('editar una Ruta', () => {
  const calles = [street('c1', [[0, 0], [100, 0]]), { id: 'vieja', points: [[0, 0], [1, 0], [1, 1]] }];

  test('mover el eje regenera el contorno', () => {
    const next = withStreetAxis(calles, 'c1', [[0, 0], [0, 100]], NO_HOMOGRAPHY);
    expect(next[0].axis).toEqual([[0, 0], [0, 100]]);
    expect(next[0].points).toEqual(streetRibbon([[0, 0], [0, 100]], 20, NO_HOMOGRAPHY));
    expect(next[1]).toBe(calles[1]);
  });

  test('cambiar el ancho regenera el contorno', () => {
    const next = withStreetWidth(calles, 'c1', 50, NO_HOMOGRAPHY);
    expect(next[0].width).toBe(50);
    expect(next[0].points).toEqual(buildStreetRibbon([[0, 0], [100, 0]], 50));
  });

  test('una calle vieja dibujada a mano (sin eje) no se toca', () => {
    expect(withStreetWidth(calles, 'vieja', 50, NO_HOMOGRAPHY)[1]).toBe(calles[1]);
  });
});

test('hasAnyShape / hasStreetPaths', () => {
  expect(hasAnyShape(EMPTY)).toBe(false);
  expect(hasAnyShape({ manzanas: [{}], calles: [] })).toBe(true);
  expect(hasStreetPaths([{ id: 'vieja', points: [] }])).toBe(false);
  expect(hasStreetPaths([street('c1', [[0, 0], [1, 0]])])).toBe(true);
});

describe('selección y borrado de una shape puntual', () => {
  const square = (x0, y0, size) => [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]];
  // La calle cruza por encima de la manzana en y=50.
  const surfaces = {
    manzanas: [{ id: 'm1', points: square(0, 0, 100) }, { id: 'm2', points: square(200, 0, 100) }],
    calles: [street('c1', [[-50, 50], [150, 50]], 20), { id: 'vieja', points: square(400, 0, 50) }],
  };

  test('la calle gana sobre la manzana de abajo', () => {
    expect(findSurfaceAtPoint(surfaces, [50, 50])).toEqual({ kind: 'calle', id: 'c1' });
    expect(findSurfaceAtPoint(surfaces, [50, 10])).toEqual({ kind: 'manzana', id: 'm1' });
  });

  test('también encuentra calles viejas dibujadas a mano', () => {
    expect(findSurfaceAtPoint(surfaces, [420, 20])).toEqual({ kind: 'calle', id: 'vieja' });
  });

  test('fuera de todo, null', () => {
    expect(findSurfaceAtPoint(surfaces, [150, 200])).toBeNull();
  });

  test('una capa oculta no se puede elegir', () => {
    const hidden = { lotes: true, manzanas: true, calles: false };
    expect(findSurfaceAtPoint(surfaces, [50, 50], hidden)).toEqual({ kind: 'manzana', id: 'm1' });
  });

  test('removeShape saca solo esa shape y no toca la otra lista', () => {
    const next = removeShape(surfaces, { kind: 'manzana', id: 'm1' });
    expect(next.manzanas.map(s => s.id)).toEqual(['m2']);
    expect(next.calles).toBe(surfaces.calles);
  });

  test('removeShape de algo que no existe: null', () => {
    expect(removeShape(surfaces, { kind: 'calle', id: 'nope' })).toBeNull();
    expect(removeShape(surfaces, null)).toBeNull();
  });

  test('findShape', () => {
    expect(findShape(surfaces, { kind: 'calle', id: 'c1' })).toBe(surfaces.calles[0]);
    expect(findShape(surfaces, null)).toBeNull();
  });
});
