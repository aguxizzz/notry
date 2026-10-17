import { describe, expect, test } from 'vitest';
import { applyProjector, computeProjector, isProjectorValid, unprojectPoint } from './panoramaProjection.js';
import { PANO, syntheticCorrespondences, trueTexture } from '../test/syntheticCamera.js';

const projector = computeProjector(syntheticCorrespondences(), PANO);

describe('computeProjector', () => {
  test('con 4 puntos de una cámara real da un proyector válido', () => {
    expect(isProjectorValid(projector)).toBe(true);
    expect(projector.width).toBe(PANO.width);
    expect(projector.height).toBe(PANO.height);
  });

  test('devuelve null sin dimensiones o con menos de 4 pares', () => {
    expect(computeProjector(syntheticCorrespondences(), null)).toBeNull();
    expect(computeProjector(syntheticCorrespondences().slice(0, 3), PANO)).toBeNull();
  });

  test('widthScale es un número positivo (lo usa la Ruta de calles)', () => {
    expect(projector.widthScale).toBeGreaterThan(0);
  });
});

describe('applyProjector', () => {
  test.each([
    [[0.5, 0.5]],
    [[0.02, 0.98]],
    [[0.97, 0.03]],
    [[0.3, 0.7]],
  ])('proyecta %j donde cae realmente en el panorama', point => {
    const [x, y] = applyProjector(projector, point);
    const [ex, ey] = trueTexture(point);
    // Error menor a una centésima de pixel sobre una textura de 4000px.
    expect(Math.abs(x - ex)).toBeLessThan(0.01);
    expect(Math.abs(y - ey)).toBeLessThan(0.01);
  });

  test('funciona igual con un panorama recortado (no 2:1)', () => {
    const dims = { width: 4000, height: 1600 };
    const cropped = computeProjector(syntheticCorrespondences(undefined, dims), dims);
    const [x, y] = applyProjector(cropped, [0.4, 0.6]);
    const [ex, ey] = trueTexture([0.4, 0.6], dims);
    expect(x).toBeCloseTo(ex, 2);
    expect(y).toBeCloseTo(ey, 2);
  });
});

describe('unprojectPoint', () => {
  test('es la inversa de applyProjector', () => {
    for (const p of [[0.5, 0.5], [0.1, 0.9], [0.8, 0.2]]) {
      const [nx, ny] = unprojectPoint(projector, applyProjector(projector, p));
      expect(nx).toBeCloseTo(p[0], 6);
      expect(ny).toBeCloseTo(p[1], 6);
    }
  });

  test('un punto sobre el horizonte del piso no tiene vuelta (NaN)', () => {
    // Fila central de la textura = pitch 0 = rayo paralelo al piso.
    const [nx, ny] = unprojectPoint(projector, [PANO.width / 2, PANO.height / 2]);
    expect(Number.isFinite(nx) && Number.isFinite(ny)).toBe(false);
  });
});
