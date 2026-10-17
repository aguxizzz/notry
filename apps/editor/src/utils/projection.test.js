import { describe, expect, test } from 'vitest';
import { computeProjector, applyProjector } from './panoramaProjection.js';
import {
  projectLotAnnotations, projectPolygon, projectPolygonDense, unimportLotAnnotations,
} from './projection.js';
import { PANO, syntheticCorrespondences } from '../test/syntheticCamera.js';

const projector = computeProjector(syntheticCorrespondences(), PANO);
const SQUARE = [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]];

describe('projectPolygon', () => {
  test('proyecta cada vértice, sin agregar puntos', () => {
    const projected = projectPolygon(SQUARE, projector);
    expect(projected).toHaveLength(4);
    expect(projected[2]).toEqual(applyProjector(projector, SQUARE[2]));
  });

  test('null sin proyector o con menos de 3 puntos', () => {
    expect(projectPolygon(SQUARE, null)).toBeNull();
    expect(projectPolygon(SQUARE.slice(0, 2), projector)).toBeNull();
  });
});

describe('projectPolygonDense', () => {
  test('subdivide los lados pero mantiene los vértices originales', () => {
    const dense = projectPolygonDense(SQUARE, projector);
    expect(dense.length).toBeGreaterThan(SQUARE.length);
    for (const vertex of SQUARE) {
      const [x, y] = applyProjector(projector, vertex);
      expect(dense.some(([dx, dy]) => Math.abs(dx - x) < 1e-9 && Math.abs(dy - y) < 1e-9)).toBe(true);
    }
  });
});

describe('projectLotAnnotations', () => {
  const lots = [
    { id: 'a', type: 'polygon', blueprint_coordinates: SQUARE },
    { id: 'b', type: 'polygon', blueprint_coordinates: SQUARE, panorama_coordinates: [[1, 1], [2, 2], [3, 1]] },
    { id: 'c', type: 'polygon', pending: true, blueprint_coordinates: SQUARE },
    { id: 'd', type: 'poi', blueprint_coordinates: SQUARE },
  ];

  test('sin overwrite solo proyecta lotes sin ubicación en el panorama', () => {
    const { annotations, count } = projectLotAnnotations(lots, projector);
    expect(count).toBe(1);
    expect(annotations[0].panorama_coordinates).toHaveLength(4);
    expect(annotations[1]).toBe(lots[1]);
    expect(annotations[2]).toBe(lots[2]); // pendiente: no se toca
    expect(annotations[3]).toBe(lots[3]); // POI: no se toca
  });

  test('con overwrite reproyecta también los que ya tenían ubicación', () => {
    expect(projectLotAnnotations(lots, projector, { overwrite: true }).count).toBe(2);
  });

  test('no guarda geometría derivada (polygonPixels) en la anotación', () => {
    const legacy = lots.map(lot => ({ ...lot, polygonPixels: [[0, 0]] }));
    const [projected] = projectLotAnnotations(legacy, projector).annotations;
    expect(projected).not.toHaveProperty('polygonPixels');
  });
});

describe('unimportLotAnnotations', () => {
  test('vacía las coordenadas del panorama solo de los ids pedidos', () => {
    const lots = [
      { id: 'a', panorama_coordinates: [[1, 1]], blueprint_coordinates: SQUARE },
      { id: 'b', panorama_coordinates: [[1, 1]] },
    ];
    const result = unimportLotAnnotations(lots, ['a']);
    expect(result[0].panorama_coordinates).toEqual([]);
    expect(result[0].blueprint_coordinates).toBe(SQUARE);
    expect(result[1]).toBe(lots[1]);
    expect(result[0]).not.toHaveProperty('polygonPixels');
  });

  test('en el plano vacía blueprint_coordinates y conserva el panorama', () => {
    const lot = { id: 'a', panorama_coordinates: [[1, 1]], blueprint_coordinates: SQUARE };
    const [result] = unimportLotAnnotations([lot], ['a'], 'blueprint');
    expect(result.blueprint_coordinates).toEqual([]);
    expect(result.panorama_coordinates).toBe(lot.panorama_coordinates);
  });
});
