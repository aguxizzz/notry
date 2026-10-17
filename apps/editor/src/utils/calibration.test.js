import { describe, expect, test } from 'vitest';
import {
  isCalibrationPairTooClose, matchPanoramaPoint, moveCalibrationPoint, queueBlueprintPoint, withPairIds,
} from './calibration.js';

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

const pair = (id, bp = [0.1, 0.1], pano = [100, 100]) => ({ _id: id, blueprint: bp, panorama: pano });

describe('queueBlueprintPoint', () => {
  test('sin pares, el lote es de 4: se llena al cuarto punto', () => {
    let pending = [];
    for (let i = 0; i < 3; i++) {
      const step = queueBlueprintPoint([], pending, [i / 10, 0]);
      expect(step.batchFull).toBe(false);
      pending = step.pending;
    }
    const last = queueBlueprintPoint([], pending, [0.9, 0]);
    expect(last.batchFull).toBe(true);
    expect(last.pending).toHaveLength(4);
  });

  test('con 3 pares, el lote es de 1', () => {
    const pairs = [pair('a'), pair('b'), pair('c')];
    expect(queueBlueprintPoint(pairs, [], [0.5, 0.5]).batchFull).toBe(true);
  });

  test('con 4 pares no se agrega nada', () => {
    expect(queueBlueprintPoint([pair('a'), pair('b'), pair('c'), pair('d')], [], [0.5, 0.5])).toBeNull();
  });
});

describe('matchPanoramaPoint', () => {
  test('empareja con el punto del plano más viejo de la cola', () => {
    const step = matchPanoramaPoint([], [[0.1, 0.2], [0.3, 0.4]], [500, 600], 'x');
    expect(step.pairs).toEqual([{ _id: 'x', blueprint: [0.1, 0.2], panorama: [500, 600] }]);
    expect(step.pending).toEqual([[0.3, 0.4]]);
    expect(step.batchDone).toBe(false);
    expect(step.calibrationComplete).toBe(false);
  });

  test('el último del lote que llega a 4 pares completa la calibración', () => {
    const step = matchPanoramaPoint([pair('a'), pair('b'), pair('c')], [[0.5, 0.5]], [1, 2], 'd');
    expect(step.batchDone).toBe(true);
    expect(step.calibrationComplete).toBe(true);
  });

  test('un lote ad-hoc que no llega a 4 termina el lote pero no la calibración', () => {
    const step = matchPanoramaPoint([pair('a')], [[0.5, 0.5]], [1, 2], 'b');
    expect(step.batchDone).toBe(true);
    expect(step.calibrationComplete).toBe(false);
  });

  test('sin cola, null', () => {
    expect(matchPanoramaPoint([], [], [1, 2], 'x')).toBeNull();
  });
});

describe('moveCalibrationPoint', () => {
  const pairs = [pair('a'), pair('b')];

  test('en el plano acota a [0, 1] y no toca el panorama', () => {
    const next = moveCalibrationPoint(pairs, 'a', 'blueprint', [1.4, -0.2]);
    expect(next[0]).toEqual({ _id: 'a', blueprint: [1, 0], panorama: [100, 100] });
    expect(next[1]).toBe(pairs[1]);
  });

  test('en el panorama son pixeles: no se acota', () => {
    expect(moveCalibrationPoint(pairs, 'b', 'panorama', [5000, -3])[1].panorama).toEqual([5000, -3]);
  });
});

test('withPairIds completa solo los _id que faltan', () => {
  const [kept, filled] = withPairIds([pair('a'), { blueprint: [0, 0], panorama: [0, 0] }]);
  expect(kept._id).toBe('a');
  expect(typeof filled._id).toBe('string');
  expect(withPairIds(null)).toEqual([]);
});
