import { describe, it, expect, vi } from 'vitest';
import { createHeadingStore, headingDegrees, shortestDelta } from './headingStore.js';

describe('createHeadingStore', () => {
  it('subscribe entrega el valor actual y después los cambios', () => {
    const store = createHeadingStore(1);
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.set(2);
    store.set(2);
    off();
    store.set(3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(store.get()).toBe(3);
  });
});

describe('headingDegrees', () => {
  it('resta el norte y normaliza a [0, 360)', () => {
    expect(headingDegrees(Math.PI / 2, 0)).toBeCloseTo(90);
    expect(headingDegrees(0, Math.PI / 2)).toBeCloseTo(270);
    expect(headingDegrees(-Math.PI * 5, 0)).toBeCloseTo(180);
  });
});

describe('shortestDelta', () => {
  it('cruza el 0 por el lado corto', () => {
    expect(shortestDelta(359, 1)).toBe(2);
    expect(shortestDelta(1, 359)).toBe(-2);
    expect(shortestDelta(10, 40)).toBe(30);
  });
});
