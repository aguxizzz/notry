import { describe, expect, test } from 'vitest';
import { geoOverlayAnnotations, projectGeoPolygons } from './geoCalibration.js';
import { MARKER_ID, geoCalibPointId } from './markerIds.js';

// Verdad conocida: el plano es un rectángulo alineado al norte, así que la
// relación plano → (lat, lng) es afín (caso particular de una homografía).
const toGeo = ([nx, ny]) => [-34.6 - 0.01 * ny, -58.4 + 0.02 * nx];
const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
const geoPoints = corners.map((bp, i) => ({ _id: `g${i}`, blueprint: bp, geo: toGeo(bp) }));

describe('projectGeoPolygons', () => {
  const lot = { id: 'l1', type: 'polygon', blueprint_coordinates: [[0.2, 0.3], [0.5, 0.3], [0.5, 0.7]] };
  const poi = { id: 'p1', type: 'poi', blueprint_coordinates: [[0.1, 0.1]] };
  const sinPlano = { id: 'l2', type: 'polygon', blueprint_coordinates: [] };

  test('lleva cada vértice del plano a lat/lng', () => {
    const [projected] = projectGeoPolygons([lot], geoPoints);
    projected.geo_coordinates.forEach((pt, i) => {
      const [lat, lng] = toGeo(lot.blueprint_coordinates[i]);
      expect(pt[0]).toBeCloseTo(lat, 9);
      expect(pt[1]).toBeCloseTo(lng, 9);
    });
  });

  test('solo toca polígonos con ubicación en el plano', () => {
    const out = projectGeoPolygons([lot, poi, sinPlano], geoPoints);
    expect(out[1]).toBe(poi);
    expect(out[2]).toBe(sinPlano);
  });

  test('con menos de 4 pares, null', () => {
    expect(projectGeoPolygons([lot], geoPoints.slice(0, 3))).toBeNull();
  });

  test('con pares degenerados (todos en línea), null', () => {
    const line = [0, 0.25, 0.5, 1].map((t, i) => ({ _id: `g${i}`, blueprint: [t, t], geo: toGeo([t, t]) }));
    expect(projectGeoPolygons([lot], line)).toBeNull();
  });
});

describe('geoOverlayAnnotations', () => {
  const lot = { id: 'l1', type: 'polygon', blueprint_coordinates: [[0, 0], [1, 0], [1, 1]] };

  test('lotes del plano + puntos numerados + el pendiente al final', () => {
    const out = geoOverlayAnnotations([lot, { id: 'p', type: 'poi' }], geoPoints.slice(0, 2), [0.5, 0.5]);
    expect(out.map(a => a.id)).toEqual(['l1', geoCalibPointId('g0'), geoCalibPointId('g1'), MARKER_ID.geoCalibPending]);
    expect(out.map(a => a.label)).toEqual([undefined, '1', '2', '3']);
    expect(out[3].svgStyle.opacity).toBe(0.5);
  });

  test('sin pendiente, sin marker pendiente', () => {
    expect(geoOverlayAnnotations([], geoPoints, null)).toHaveLength(4);
  });
});
