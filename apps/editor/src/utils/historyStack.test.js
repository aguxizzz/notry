import { describe, expect, test } from 'vitest';
import {
  EMPTY_HISTORY, pushSnapshot, redoSnapshot, undoSnapshot, withoutAnnotations,
} from './historyStack.js';

const s = (n, geo = []) => ({ annotations: [{ id: `a${n}` }], geoCalibrationPoints: geo });

describe('historyStack', () => {
  test('sin historial, undo y redo no hacen nada', () => {
    expect(undoSnapshot(EMPTY_HISTORY, s(0))).toBeNull();
    expect(redoSnapshot(EMPTY_HISTORY, s(0))).toBeNull();
  });

  test('undo devuelve el último snapshot y manda el estado actual a future', () => {
    const history = pushSnapshot(pushSnapshot(EMPTY_HISTORY, s(1)), s(2));
    const { history: after, restored } = undoSnapshot(history, s(3));
    expect(restored).toEqual(s(2));
    expect(after.past).toEqual([s(1)]);
    expect(after.future).toEqual([s(3)]);
  });

  test('undo + redo vuelve al mismo estado', () => {
    const history = pushSnapshot(EMPTY_HISTORY, s(1));
    const undone = undoSnapshot(history, s(2));
    const redone = redoSnapshot(undone.history, undone.restored);
    expect(redone.restored).toEqual(s(2));
    expect(redone.history.past).toEqual([s(1)]);
    expect(redone.history.future).toEqual([]);
  });

  test('un cambio nuevo descarta el redo', () => {
    const undone = undoSnapshot(pushSnapshot(EMPTY_HISTORY, s(1)), s(2));
    expect(pushSnapshot(undone.history, s(1)).future).toEqual([]);
  });

  test('los slices que no son anotaciones (geo-calibración) viajan en el snapshot', () => {
    const pair = { _id: 'g1', blueprint: [0.1, 0.2], geo: [-34, -58] };
    const history = pushSnapshot(EMPTY_HISTORY, s(1, []));
    expect(undoSnapshot(history, s(1, [pair])).restored.geoCalibrationPoints).toEqual([]);
  });

  test('withoutAnnotations saca el id/uuid de past y future, sin tocar el resto', () => {
    const entry = { annotations: [{ id: 'x' }, { id: 1, uuid: 'u1' }, { id: 'keep' }], calibrationPoints: [1] };
    const history = { past: [entry], future: [entry] };
    const cleaned = withoutAnnotations(history, ['x', 'u1', null]);
    expect(cleaned.past[0].annotations).toEqual([{ id: 'keep' }]);
    expect(cleaned.future[0].annotations).toEqual([{ id: 'keep' }]);
    expect(cleaned.past[0].calibrationPoints).toEqual([1]);
    expect(withoutAnnotations(history, [null])).toBe(history);
  });
});
