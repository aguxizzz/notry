import { describe, expect, test } from 'vitest';
import {
  AXIS_SNAP_THRESHOLD, buildProjectedStreetRibbon, buildStreetRibbon, findAxisEndpointSnap,
  findStreetShapeAtPoint, mergeStreetAxis, unionStreetPolygons,
} from './streetPath.js';
import { computeProjector } from './panoramaProjection.js';
import { PANO, syntheticCorrespondences } from '../test/syntheticCamera.js';

describe('buildStreetRibbon', () => {
  test('un eje recto da un rectángulo del ancho pedido', () => {
    expect(buildStreetRibbon([[0, 0], [100, 0]], 10)).toEqual([[0, 5], [100, 5], [100, -5], [0, -5]]);
  });

  test('con esquinas, el ancho se mantiene constante en todo el recorrido', () => {
    const ribbon = buildStreetRibbon([[0, 0], [100, 0], [100, 100], [200, 150]], 20);
    const half = ribbon.length / 2;
    for (let i = 0; i < half; i++) {
      const left = ribbon[i];
      const right = ribbon[ribbon.length - 1 - i];
      expect(Math.hypot(left[0] - right[0], left[1] - right[1])).toBeCloseTo(20, 6);
    }
  });

  test('sin ancho o con menos de 2 puntos no genera nada', () => {
    expect(buildStreetRibbon([[0, 0], [10, 0]], 0)).toEqual([]);
    expect(buildStreetRibbon([[0, 0]], 10)).toEqual([]);
    expect(buildStreetRibbon(null, 10)).toEqual([]);
  });
});

describe('findAxisEndpointSnap', () => {
  const shapes = [
    { id: 'r1', axis: [[0, 0], [100, 0], [200, 0]] },
    { id: 'r2', axis: [[500, 500], [600, 500]] },
  ];

  test('detecta inicio, final y vértice interior', () => {
    expect(findAxisEndpointSnap([3, 2], shapes)).toMatchObject({ shapeId: 'r1', end: 'start', point: [0, 0] });
    expect(findAxisEndpointSnap([198, 1], shapes)).toMatchObject({ shapeId: 'r1', end: 'end' });
    expect(findAxisEndpointSnap([101, 1], shapes)).toMatchObject({ shapeId: 'r1', end: 'interior', vertexIndex: 1 });
  });

  test('fuera del umbral no snapea', () => {
    expect(findAxisEndpointSnap([AXIS_SNAP_THRESHOLD + 1, 0], shapes)).toBeNull();
  });

  test('ignora la shape excluida y las que no tienen eje', () => {
    expect(findAxisEndpointSnap([0, 0], shapes, 'r1')).toBeNull();
    expect(findAxisEndpointSnap([0, 0], [{ id: 'x', points: [[0, 0]] }])).toBeNull();
  });
});

describe('mergeStreetAxis', () => {
  test('por el final: agrega los puntos nuevos descartando el click del snap', () => {
    expect(mergeStreetAxis([[0, 0], [10, 0]], 'end', [[10.5, 0], [20, 0], [30, 0]]))
      .toEqual([[0, 0], [10, 0], [20, 0], [30, 0]]);
  });

  test('por el inicio: los antepone en orden inverso', () => {
    expect(mergeStreetAxis([[0, 0], [10, 0]], 'start', [[0.5, 0], [-10, 0], [-20, 0]]))
      .toEqual([[-20, 0], [-10, 0], [0, 0], [10, 0]]);
  });
});

describe('findStreetShapeAtPoint', () => {
  test('encuentra la Ruta cuyo contorno contiene el punto', () => {
    const shapes = [
      { id: 'libre', points: [[0, 0], [10, 0], [10, 10], [0, 10]] }, // sin eje: se ignora
      { id: 'ruta', axis: [[0, 5], [10, 5]], points: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    ];
    expect(findStreetShapeAtPoint([5, 5], shapes)).toBe('ruta');
    expect(findStreetShapeAtPoint([50, 50], shapes)).toBeNull();
  });
});

describe('unionStreetPolygons', () => {
  const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

  test('dos polígonos superpuestos se funden en un solo contorno', () => {
    const rings = unionStreetPolygons([square(0, 0, 10), square(5, 5, 10)]);
    expect(rings).toHaveLength(1);
    // anillo abierto: sin repetir el primer punto al final
    expect(rings[0][0]).not.toEqual(rings[0][rings[0].length - 1]);
  });

  test('polígonos separados quedan como contornos distintos', () => {
    expect(unionStreetPolygons([square(0, 0, 10), square(50, 50, 10)])).toHaveLength(2);
  });

  test('uno solo se devuelve tal cual; los inválidos se descartan', () => {
    expect(unionStreetPolygons([square(0, 0, 10)])).toEqual([square(0, 0, 10)]);
    expect(unionStreetPolygons([[[0, 0], [1, 1]]])).toEqual([]);
  });
});

describe('buildProjectedStreetRibbon', () => {
  const projector = computeProjector(syntheticCorrespondences(), PANO);

  test('sin calibración devuelve null (el caller cae a buildStreetRibbon)', () => {
    expect(buildProjectedStreetRibbon([[1000, 1500], [1500, 1500]], 40, null)).toBeNull();
  });

  test('con calibración da un contorno de puntos finitos', () => {
    const ribbon = buildProjectedStreetRibbon([[1800, 1400], [2200, 1450]], 40, projector);
    expect(ribbon.length).toBeGreaterThan(4);
    expect(ribbon.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  test('un eje sobre el horizonte (no proyectable) devuelve null', () => {
    expect(buildProjectedStreetRibbon([[1800, 1000], [2200, 1000]], 40, projector)).toBeNull();
  });
});
