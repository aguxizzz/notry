import { describe, expect, test } from 'vitest';
import {
  anchorKey, coordsKey, getAnchor, getShapeCoords, hasLocationIn, isCallout, isShape,
  normalizeApiAnnotation, reinsertAnnotation, spaceForMode, toModeAnnotation, withAnchor, withShapeCoords,
} from './annotationModel.js';

const PANO = [[100, 200], [300, 200], [300, 400]];
const BLUEPRINT = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]];
const lot = { id: 'L1', type: 'polygon', panorama_coordinates: PANO, blueprint_coordinates: BLUEPRINT };

describe('vista → espacio', () => {
  test('render dibuja sobre el panorama', () => {
    expect(spaceForMode('render')).toBe('panorama');
    expect(coordsKey('render')).toBe('panorama_coordinates');
    expect(coordsKey('blueprint')).toBe('blueprint_coordinates');
    expect(anchorKey('panorama')).toBe('panorama_anchor');
    expect(anchorKey('blueprint')).toBe('blueprint_anchor');
  });
});

describe('isCallout / isShape', () => {
  test('acepta los dos nombres del campo', () => {
    expect(isCallout({ type: 'poi', variant: 'callout' })).toBe(true);
    expect(isCallout({ type: 'poi', marker_variant: 'callout' })).toBe(true);
    expect(isCallout({ type: 'poi', variant: 'area' })).toBe(false);
  });

  test('sin variante no es callout', () => {
    expect(isCallout({ type: 'polygon' })).toBe(false);
    expect(isCallout(null)).toBe(false);
  });

  test('lotes y POIs son formas; textos no', () => {
    expect(isShape(lot)).toBe(true);
    expect(isShape({ type: 'poi' })).toBe(true);
    expect(isShape({ type: 'text' })).toBe(false);
  });
});

describe('geometría por vista', () => {
  test('lee la geometría de la vista pedida', () => {
    expect(getShapeCoords(lot, 'panorama')).toBe(PANO);
    expect(getShapeCoords(lot, 'blueprint')).toBe(BLUEPRINT);
  });

  test('sin geometría en esa vista devuelve [] (no la de la otra vista)', () => {
    const onlyPano = { type: 'polygon', panorama_coordinates: PANO };
    expect(getShapeCoords(onlyPano, 'blueprint')).toEqual([]);
  });

  test('borrador viejo con solo polygonPixels sigue visible', () => {
    expect(getShapeCoords({ type: 'polygon', polygonPixels: PANO }, 'panorama')).toBe(PANO);
  });

  test('withShapeCoords escribe solo la vista pedida y descarta polygonPixels', () => {
    const legacy = { ...lot, polygonPixels: PANO };
    const next = withShapeCoords(legacy, 'blueprint', [[0, 0], [1, 0], [1, 1]]);
    expect(next.blueprint_coordinates).toEqual([[0, 0], [1, 0], [1, 1]]);
    expect(next.panorama_coordinates).toBe(PANO);
    expect(next).not.toHaveProperty('polygonPixels');
    expect(legacy.blueprint_coordinates).toBe(BLUEPRINT); // no muta
  });

  test('anclas de callout por vista', () => {
    const poi = withAnchor({ type: 'poi', variant: 'callout' }, 'panorama', [10, 20]);
    expect(getAnchor(poi, 'panorama')).toEqual([10, 20]);
    expect(getAnchor(poi, 'blueprint')).toBeNull();
  });

  test('hasLocationIn distingue formas y callouts', () => {
    expect(hasLocationIn(lot, 'blueprint')).toBe(true);
    expect(hasLocationIn({ type: 'polygon', panorama_coordinates: [] }, 'panorama')).toBe(false);
    const poi = { type: 'poi', variant: 'callout', panorama_anchor: [1, 2] };
    expect(hasLocationIn(poi, 'panorama')).toBe(true);
    expect(hasLocationIn(poi, 'blueprint')).toBe(false);
  });
});

describe('toModeAnnotation', () => {
  test('agrega polygonPixels de la vista actual a las formas', () => {
    expect(toModeAnnotation(lot, 'blueprint').polygonPixels).toBe(BLUEPRINT);
    expect(toModeAnnotation(lot, 'render').polygonPixels).toBe(PANO);
  });

  test('textos y callouts pasan sin tocar', () => {
    const text = { type: 'text', position: { textureX: 1, textureY: 2 } };
    const callout = { type: 'poi', variant: 'callout', panorama_anchor: [1, 2] };
    expect(toModeAnnotation(text, 'panorama')).toBe(text);
    expect(toModeAnnotation(callout, 'panorama')).toBe(callout);
  });
});

describe('normalizeApiAnnotation', () => {
  test('usa el id del backend, o el uuid, o uno por índice', () => {
    expect(normalizeApiAnnotation({ id: 'a', uuid: 'b' }, 0).id).toBe('a');
    expect(normalizeApiAnnotation({ uuid: 'b' }, 0).id).toBe('b');
    expect(normalizeApiAnnotation({}, 3).id).toBe('ann-3');
  });

  test('variant sale de marker_variant, con default area', () => {
    expect(normalizeApiAnnotation({ marker_variant: 'callout' }, 0).variant).toBe('callout');
    expect(normalizeApiAnnotation({}, 0).variant).toBe('area');
  });

  test('no agrega geometría derivada al estado', () => {
    const normalized = normalizeApiAnnotation({ type: 'polygon', panorama_coordinates: PANO, polygonPixels: PANO }, 0);
    expect(normalized).not.toHaveProperty('polygonPixels');
    expect(normalized).not.toHaveProperty('position');
    expect(normalized.panorama_coordinates).toBe(PANO);
  });
});

describe('reinsertAnnotation (rollback de borrado optimista)', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  test('vuelve a su posición original', () => {
    expect(reinsertAnnotation([a, c], b, 1)).toEqual([a, b, c]);
  });

  test('si la lista se achicó mientras tanto, va al final', () => {
    expect(reinsertAnnotation([a], c, 5)).toEqual([a, c]);
  });

  test('no la duplica si ya volvió (p. ej. por un undo)', () => {
    const list = [a, b];
    expect(reinsertAnnotation(list, b, 0)).toBe(list);
  });
});
