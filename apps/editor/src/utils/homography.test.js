import { describe, expect, test } from 'vitest';
import {
  applyHomography, computeHomography, invertHomography, isHomographyValid,
} from './homography.js';

const H_TRUE = [1.2, 0.1, 30, -0.2, 0.9, 50, 0.001, 0.002, 1];
const SRC = [[0, 0], [100, 0], [100, 80], [0, 80], [50, 40], [20, 70]];
const correspondences = points => points.map(src => ({ src, dst: applyHomography(H_TRUE, src) }));

const expectPointClose = (actual, expected, digits = 6) => {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
};

describe('computeHomography', () => {
  test('con 4 pares recupera la homografía exacta', () => {
    const H = computeHomography(correspondences(SRC.slice(0, 4)));
    expect(isHomographyValid(H)).toBe(true);
    expectPointClose(applyHomography(H, [37, 61]), applyHomography(H_TRUE, [37, 61]));
  });

  test('con más de 4 pares (mínimos cuadrados) también la recupera', () => {
    const H = computeHomography(correspondences(SRC));
    expectPointClose(applyHomography(H, [73, 12]), applyHomography(H_TRUE, [73, 12]), 4);
  });

  test('devuelve null con menos de 4 pares', () => {
    expect(computeHomography(correspondences(SRC.slice(0, 3)))).toBeNull();
    expect(computeHomography(null)).toBeNull();
  });

  test('puntos colineales no dan una homografía usable', () => {
    const collinear = [[0, 0], [1, 1], [2, 2], [3, 3]].map(src => ({ src, dst: src }));
    expect(isHomographyValid(computeHomography(collinear))).toBe(false);
  });
});

describe('invertHomography', () => {
  test('aplicar H y después su inversa vuelve al punto original', () => {
    const Hinv = invertHomography(H_TRUE);
    for (const p of SRC) expectPointClose(applyHomography(Hinv, applyHomography(H_TRUE, p)), p);
  });

  test('una matriz singular devuelve null', () => {
    expect(invertHomography([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull();
  });
});

describe('isHomographyValid', () => {
  test('rechaza null, largo incorrecto y valores no finitos', () => {
    expect(isHomographyValid(null)).toBe(false);
    expect(isHomographyValid([1, 0, 0])).toBe(false);
    expect(isHomographyValid([1, 0, 0, 0, NaN, 0, 0, 0, 1])).toBe(false);
  });
});
