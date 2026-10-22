import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHistory } from './history.js';

// Un "valor" con pasos que se invierten solos, como los del store.
function counter() {
  const box = { value: 0 };
  const setTo = (v) => {
    const before = box.value;
    box.value = v;
    return () => setTo(before);
  };
  return { box, setTo };
}

afterEach(() => vi.useRealTimers());

describe('history', () => {
  it('deshace y rehace en orden', () => {
    const { box, setTo } = counter();
    const h = createHistory();
    h.record(setTo(1));
    h.record(setTo(2));

    h.undo();
    expect(box.value).toBe(1);
    h.undo();
    expect(box.value).toBe(0);
    expect(h.undo()).toBe(false);
    h.redo();
    h.redo();
    expect(box.value).toBe(2);
  });

  it('junta pasos seguidos con la misma clave y los separa pasado el tiempo', () => {
    vi.useFakeTimers();
    const { box, setTo } = counter();
    const h = createHistory({ mergeMs: 1000 });
    h.record(setTo(1), 'k');
    h.record(setTo(2), 'k');
    vi.advanceTimersByTime(1500);
    h.record(setTo(3), 'k');

    h.undo();
    expect(box.value).toBe(2);
    h.undo();
    expect(box.value).toBe(0);
  });

  it('respeta el límite', () => {
    const { setTo } = counter();
    const h = createHistory({ limit: 2 });
    [1, 2, 3].forEach((v) => h.record(setTo(v)));
    expect(h.undo() && h.undo()).toBe(true);
    expect(h.canUndo()).toBe(false);
  });
});
