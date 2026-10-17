import { describe, expect, test } from 'vitest';
import {
  buildCalibrationMarkers, buildDrawingMarkers, buildGhostMarkers, buildVertexHandles, toModeAnnotations,
} from './useDisplayAnnotations.js';
import { parseEditCornerId, parseEditMidpointId } from '../utils/markerIds.js';
import { computeProjector } from '../utils/panoramaProjection.js';
import { PANO as PANORAMA, syntheticCorrespondences } from '../test/syntheticCamera.js';

const PANO = [[100, 200], [300, 200], [300, 400]];
const BLUEPRINT = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6]];

describe('toModeAnnotations', () => {
  const annotations = [
    { id: 'L1', type: 'polygon', panorama_coordinates: PANO, blueprint_coordinates: BLUEPRINT },
    { id: 'P1', type: 'poi', variant: 'callout', panorama_anchor: [1, 2] },
    { id: 'T1', type: 'text', position: { textureX: 1, textureY: 2 } },
  ];

  test('en el plano no se muestran POIs ni textos', () => {
    expect(toModeAnnotations(annotations, 'blueprint').map(a => a.id)).toEqual(['L1']);
  });

  test('cada forma lleva la geometría de la vista actual', () => {
    expect(toModeAnnotations(annotations, 'blueprint')[0].polygonPixels).toBe(BLUEPRINT);
    expect(toModeAnnotations(annotations, 'panorama')[0].polygonPixels).toBe(PANO);
  });

  test('un lote pendiente dibujado en el panorama no aparece en el plano', () => {
    const pending = { id: 'N', type: 'polygon', pending: true, panorama_coordinates: PANO };
    expect(toModeAnnotations([pending], 'blueprint')[0].polygonPixels).toEqual([]);
  });
});

describe('buildVertexHandles', () => {
  test('una esquina y un punto medio por vértice, con ids parseables', () => {
    const handles = buildVertexHandles({ id: 'L-1', type: 'polygon', polygonPixels: BLUEPRINT });
    expect(handles).toHaveLength(6);
    expect(parseEditCornerId(handles[0].id)).toEqual({ ownerId: 'L-1', index: 0 });
    expect(parseEditMidpointId(handles[5].id)).toEqual({ ownerId: 'L-1', index: 2 });
  });

  test('el punto medio de la última arista cierra contra el primer vértice', () => {
    const handles = buildVertexHandles({ id: 'L', type: 'polygon', polygonPixels: BLUEPRINT });
    expect(handles[5].position).toEqual({ textureX: 0.5, textureY: 0.5 });
  });

  test('los handles de un POI usan su color', () => {
    const [corner, mid] = buildVertexHandles({ id: 'P', type: 'poi', color: '#ff0000', polygonPixels: BLUEPRINT });
    expect(corner.svgStyle.stroke).toBe('#ff0000');
    expect(mid.svgStyle.stroke).toBe('#ff0000');
  });

  test('sin geometría no hay handles', () => {
    expect(buildVertexHandles({ id: 'P', type: 'poi', variant: 'callout' })).toEqual([]);
  });
});

describe('buildDrawingMarkers', () => {
  test('vacío sin trazo; con trazo, línea + un punto por click', () => {
    expect(buildDrawingMarkers([])).toEqual([]);
    const markers = buildDrawingMarkers([[1, 1], [2, 2]]);
    expect(markers.map(m => m.id)).toEqual(['temp-drawing', 'temp-pt-0', 'temp-pt-1']);
    expect(markers[1].radius).toBeGreaterThan(markers[2].radius);
  });
});

describe('buildGhostMarkers', () => {
  const projector = computeProjector(syntheticCorrespondences(), PANORAMA);

  test('solo para formas con plano y sin panorama, no pendientes', () => {
    const ghosts = buildGhostMarkers([
      { id: 'A', type: 'polygon', blueprint_coordinates: BLUEPRINT },
      { id: 'B', type: 'polygon', blueprint_coordinates: BLUEPRINT, panorama_coordinates: PANO },
      { id: 'C', type: 'polygon', pending: true, blueprint_coordinates: BLUEPRINT },
      { id: 'D', type: 'text' },
    ], projector);
    expect(ghosts.map(g => g.id)).toEqual(['ghost-A']);
    expect(ghosts[0].polygonPixels.length).toBeGreaterThan(BLUEPRINT.length);
  });

  test('sin calibración no hay fantasmas', () => {
    expect(buildGhostMarkers([{ id: 'A', type: 'polygon', blueprint_coordinates: BLUEPRINT }], null)).toEqual([]);
  });
});

describe('buildCalibrationMarkers', () => {
  const pairs = [
    { _id: 'a', blueprint: [0, 0], panorama: [10, 10] },
    { _id: 'b', blueprint: [1, 0], panorama: [20, 10] },
  ];

  test('puntos numerados de la vista actual + línea', () => {
    const markers = buildCalibrationMarkers(pairs, [], 'panorama');
    expect(markers.map(m => m.id)).toEqual(['calib-link', 'calib-pt-a', 'calib-pt-b']);
    expect(markers[2].position).toEqual({ textureX: 20, textureY: 10 });
    expect(markers[2].label).toBe('2');
  });

  test('los pendientes solo se ven en el plano y siguen la numeración', () => {
    expect(buildCalibrationMarkers(pairs, [[0.5, 0.5]], 'panorama').some(m => m.id.startsWith('calib-pending'))).toBe(false);
    const pending = buildCalibrationMarkers(pairs, [[0.5, 0.5]], 'blueprint').at(-1);
    expect(pending).toMatchObject({ id: 'calib-pending-0', label: '3' });
  });

  test('con un solo punto no hay línea', () => {
    expect(buildCalibrationMarkers(pairs.slice(0, 1), [], 'blueprint').map(m => m.id)).toEqual(['calib-pt-a']);
  });
});
