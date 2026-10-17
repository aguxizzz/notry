import { describe, expect, test } from 'vitest';
import {
  buildLotItem, buildPoiCreateItem, buildPoiUpdateItem, poiChanged, polygonChanged,
} from './saveAllPayload.js';

const LOT = {
  id: 'lot-1', uuid: 'lot-1', type: 'polygon', tooltip: 'Lote 1', status: 'available',
  price: 1000, area_m2: 300, panorama_coordinates: [[1, 1], [2, 2], [3, 1]],
  blueprint_coordinates: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.1]],
};

describe('polygonChanged', () => {
  test('sin versión guardada siempre cuenta como cambio', () => {
    expect(polygonChanged(LOT, undefined)).toBe(true);
  });

  test('una copia idéntica no es un cambio', () => {
    expect(polygonChanged({ ...LOT }, LOT)).toBe(false);
  });

  test('precio "1000" vs 1000 no es un cambio (el input devuelve strings)', () => {
    expect(polygonChanged({ ...LOT, price: '1000' }, LOT)).toBe(false);
  });

  test.each([
    ['estado', { status: 'sold' }],
    ['nombre', { tooltip: 'Lote 1B' }],
    ['coordenadas del panorama', { panorama_coordinates: [[1, 1], [2, 2], [4, 1]] }],
    ['coordenadas geo', { geo_coordinates: [[-34, -58]] }],
    ['fotos', { image_urls: ['a.jpg'] }],
  ])('detecta cambio de %s', (_, patch) => {
    expect(polygonChanged({ ...LOT, ...patch }, LOT)).toBe(true);
  });
});

describe('buildLotItem', () => {
  test('solo manda las coordenadas que cambiaron', () => {
    const saved = new Map([['lot-1', LOT]]);
    const item = buildLotItem({ ...LOT, blueprint_coordinates: [[0, 0], [1, 0], [1, 1]] }, saved);
    expect(item.blueprint_coordinates).toEqual([[0, 0], [1, 0], [1, 1]]);
    expect(item).not.toHaveProperty('coordinates_360');
    expect(item).not.toHaveProperty('price');
  });

  test('lote nuevo para el diff: manda todo, nombre recortado y números parseados', () => {
    const item = buildLotItem({ ...LOT, tooltip: '  Lote 1  ', price: '12,5', status: undefined }, new Map());
    expect(item).toMatchObject({
      uuid: 'lot-1', name: 'Lote 1', status: 'available', price: 12, coordinates_360: LOT.panorama_coordinates,
    });
    expect(item.comments).toBeNull();
  });
});

const CALLOUT = {
  id: 'poi-local', type: 'poi', variant: 'callout', tooltip: ' Club House ',
  panorama_anchor: [100, 200], callout_stem_height: 120, category: ' Deportes ',
};

describe('poiChanged', () => {
  test('título: compara title o, si no hay, tooltip', () => {
    expect(poiChanged({ tooltip: 'A' }, { title: 'A' })).toBe(false);
    expect(poiChanged({ title: 'B', tooltip: 'A' }, { title: 'A' })).toBe(true);
  });

  test('detecta cambio de categoría', () => {
    expect(poiChanged({ ...CALLOUT, category: 'Otra' }, CALLOUT)).toBe(true);
  });
});

describe('buildPoiCreateItem', () => {
  test('callout: manda el ancla, client_id y defaults', () => {
    expect(buildPoiCreateItem(CALLOUT)).toMatchObject({
      client_id: 'poi-local', title: 'Club House', marker_variant: 'callout',
      callout_stem_height: 120, panorama_anchor: [100, 200], color: '#14b8a6',
      poi_kind: 'place', distance_value: null, category: 'Deportes',
    });
  });

  test('área: solo manda polígonos con al menos 3 puntos', () => {
    const item = buildPoiCreateItem({
      id: 'p', tooltip: 'Plaza', panorama_coordinates: [[1, 1], [2, 2]], blueprint_coordinates: [[0, 0], [1, 0], [1, 1]],
    });
    expect(item.marker_variant).toBe('area');
    expect(item.callout_stem_height).toBeNull();
    expect(item).not.toHaveProperty('coordinates_360');
    expect(item.blueprint_coordinates).toHaveLength(3);
  });
});

describe('buildPoiUpdateItem', () => {
  test('callout con ancla manda el ancla y no coordenadas', () => {
    const item = buildPoiUpdateItem({ ...CALLOUT, uuid: 'poi-1', panorama_coordinates: [[1, 1], [2, 2], [3, 3]] });
    expect(item.uuid).toBe('poi-1');
    expect(item.panorama_anchor).toEqual([100, 200]);
    expect(item).not.toHaveProperty('coordinates_360');
  });

  test('distance_value vacío es null, y un string numérico se convierte', () => {
    expect(buildPoiUpdateItem({ ...CALLOUT, distance_value: '' }).distance_value).toBeNull();
    expect(buildPoiUpdateItem({ ...CALLOUT, distance_value: '2.5' }).distance_value).toBe(2.5);
  });
});
