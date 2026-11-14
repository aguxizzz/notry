import { describe, expect, test } from 'vitest';
import { geoOverlayAnnotations, projectGeoPolygons, transformGeoPairs } from './geoCalibration.js';
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

describe('transformGeoPairs (Ajustar)', () => {
  const M_PER_DEG_LAT = 111320;
  const metersApart = ([la1, ln1], [la2, ln2]) => Math.hypot(
    (la2 - la1) * M_PER_DEG_LAT,
    (ln2 - ln1) * M_PER_DEG_LAT * Math.cos((la1 * Math.PI) / 180),
  );
  // Centro del plano en el mapa (los pares son las 4 esquinas, el plano es afín).
  const center = toGeo([0.5, 0.5]);
  const at = ([lat, lng]) => ({ latitude: lat, longitude: lng });

  test('mover traslada todos los pares lo mismo', () => {
    const from = at(center);
    const to = at([center[0] + 0.001, center[1] + 0.002]);
    const out = transformGeoPairs(geoPoints, { target: { type: 'move' }, from, to });
    out.forEach((pair, i) => {
      expect(pair.geo[0] - geoPoints[i].geo[0]).toBeCloseTo(0.001, 6);
      expect(pair.geo[1] - geoPoints[i].geo[1]).toBeCloseTo(0.002, 6);
      expect(pair.blueprint).toBe(geoPoints[i].blueprint); // el lado del plano no se toca
    });
  });

  test('la esquina escala y gira alrededor del centro: la esquina agarrada cae donde se suelta', () => {
    const corner = geoPoints[1].geo;
    // Soltar la esquina al doble de distancia del centro, en otra dirección.
    const to = [center[0] + 2 * (corner[1] - center[1]) * 0.5, center[1] - 2 * (corner[0] - center[0]) * 2];
    const out = transformGeoPairs(geoPoints, { target: { type: 'corner' }, from: at(corner), to: at(to) });
    expect(metersApart(out[1].geo, to)).toBeLessThan(0.01);
    // Escala uniforme: las otras esquinas también quedan al doble de distancia del centro.
    const ratio = metersApart(out[3].geo, center) / metersApart(geoPoints[3].geo, center);
    // 3 decimales: metersApart usa el coseno de la latitud de cada punto, ~0,01% de error propio.
    expect(ratio).toBeCloseTo(metersApart(to, center) / metersApart(corner, center), 3);
  });

  test('un pin mueve solo su par', () => {
    const from = at(geoPoints[2].geo);
    const to = at([geoPoints[2].geo[0] + 0.0005, geoPoints[2].geo[1]]);
    const out = transformGeoPairs(geoPoints, { target: { type: 'pin', id: 'g2' }, from, to });
    expect(out[0]).toBe(geoPoints[0]);
    expect(out[2].geo[0]).toBeCloseTo(geoPoints[2].geo[0] + 0.0005, 9);
  });
});
