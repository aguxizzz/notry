import { describe, expect, test } from 'vitest';
import { isCalibrationPairTooClose } from './calibration.js';

const PAIR = { blueprint: [0.5, 0.5], panorama: [1000, 800] };

describe('isCalibrationPairTooClose', () => {
  test('cerca en ambas vistas = demasiado cerca', () => {
    expect(isCalibrationPairTooClose(PAIR, [0.51, 0.5], [1005, 800])).toBe(true);
  });

  test('cerca en una sola vista no alcanza', () => {
    expect(isCalibrationPairTooClose(PAIR, [0.51, 0.5], [1200, 800])).toBe(false);
    expect(isCalibrationPairTooClose(PAIR, [0.9, 0.5], [1005, 800])).toBe(false);
  });

  test('un par incompleto nunca bloquea', () => {
    expect(isCalibrationPairTooClose({ blueprint: [0.5, 0.5] }, [0.5, 0.5], [1000, 800])).toBe(false);
  });
});
