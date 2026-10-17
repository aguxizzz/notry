import { describe, expect, test } from 'vitest';
import {
  rayToSpherical, sphericalMidpoint, sphericalToRay, sphericalToTexture, textureToSpherical,
} from './spherical.js';

describe('texture <-> spherical', () => {
  test('el centro de un panorama 2:1 mira a yaw 0, pitch 0', () => {
    const { yaw, pitch } = textureToSpherical(2000, 1000, 4000, 2000);
    expect(yaw).toBeCloseTo(0);
    expect(pitch).toBeCloseTo(0);
  });

  test('el borde izquierdo de la textura es la costura (yaw π)', () => {
    expect(textureToSpherical(0, 1000, 4000, 2000).yaw).toBeCloseTo(Math.PI);
  });

  test.each([
    ['2:1', 4000, 2000],
    ['recortado (no 2:1)', 4000, 1500],
  ])('ida y vuelta preserva el pixel en panorama %s', (_, width, height) => {
    for (const [x, y] of [[10, 20], [1999, 700], [3500, height - 10], [2000, height / 2]]) {
      const { yaw, pitch } = textureToSpherical(x, y, width, height);
      const back = sphericalToTexture(yaw, pitch, width, height);
      expect(back.textureX).toBeCloseTo(x, 6);
      expect(back.textureY).toBeCloseTo(y, 6);
    }
  });

  test('yaw negativo o mayor a 2π se normaliza', () => {
    const a = sphericalToTexture(-0.5, 0.2, 4000, 2000);
    const b = sphericalToTexture(2 * Math.PI - 0.5, 0.2, 4000, 2000);
    expect(a.textureX).toBeCloseTo(b.textureX);
    expect(a.textureY).toBeCloseTo(b.textureY);
  });
});

describe('spherical <-> rayo', () => {
  test('ida y vuelta', () => {
    for (const [yaw, pitch] of [[0, 0], [1, 0.3], [4, -0.8], [6, 1.2]]) {
      const back = rayToSpherical(sphericalToRay(yaw, pitch));
      expect(back.yaw).toBeCloseTo(yaw);
      expect(back.pitch).toBeCloseTo(pitch);
    }
  });

  test('rayToSpherical acepta rayos sin normalizar', () => {
    const { yaw, pitch } = rayToSpherical([0, -5, 5]);
    expect(yaw).toBeCloseTo(0);
    expect(pitch).toBeCloseTo(-Math.PI / 4);
  });
});

describe('sphericalMidpoint', () => {
  const DIMS = { width: 4000, height: 2000 };

  test('sobre el ecuador es el promedio en pixeles', () => {
    const [x, y] = sphericalMidpoint([1000, 1000], [1400, 1000], DIMS);
    expect(x).toBeCloseTo(1200);
    expect(y).toBeCloseTo(1000);
  });

  test('cruza la costura por el lado corto', () => {
    const [x, y] = sphericalMidpoint([100, 1000], [3900, 1000], DIMS);
    // x = 0 y x = 4000 son el mismo meridiano (la costura).
    expect(Math.min(x, DIMS.width - x)).toBeCloseTo(0);
    expect(y).toBeCloseTo(1000);
  });

  test('fuera del ecuador el arco se curva hacia el polo, no es el promedio', () => {
    const [x, y] = sphericalMidpoint([1000, 500], [2000, 500], DIMS);
    expect(x).toBeCloseTo(1500);
    expect(y).toBeLessThan(500);
    // Y es la verdad geométrica: equidistante (en ángulo) de los dos extremos.
    const ray = (px, py) => {
      const s = textureToSpherical(px, py, DIMS.width, DIMS.height);
      return sphericalToRay(s.yaw, s.pitch);
    };
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const m = ray(x, y);
    expect(dot(m, ray(1000, 500))).toBeCloseTo(dot(m, ray(2000, 500)));
  });

  test('extremos antípodas: promedio en pixeles', () => {
    expect(sphericalMidpoint([0, 1000], [2000, 1000], DIMS)).toEqual([1000, 1000]);
  });
});
