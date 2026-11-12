// Clip-space clipping used by the panorama polygon render (see polygonClipping.js).
import { describe, expect, test } from 'vitest';
import { clipPath, clipRing } from './polygonClipping.js';

// Clip-space point already "in front" of the camera (w = 1).
const p = (x, y, w = 1) => [x, y, 0, w];
const bounded = pts => pts.every(([x, y, , w]) => w > 0 && Math.abs(x / w) <= 1.2 + 1e-9 && Math.abs(y / w) <= 1.2 + 1e-9);

describe('clipRing', () => {
  test('keeps a ring that is fully on screen untouched', () => {
    const ring = [p(-0.5, -0.5), p(0.5, -0.5), p(0.5, 0.5), p(-0.5, 0.5)];
    expect(clipRing(ring)).toEqual(ring);
  });

  test('bounds a huge ring that covers the whole view', () => {
    const ring = [p(-1e6, -1e6), p(1e6, -1e6), p(1e6, 1e6), p(-1e6, 1e6)];
    const out = clipRing(ring);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(bounded(out)).toBe(true);
  });

  test('drops the part behind the camera', () => {
    const ring = [p(0, 0, 1), p(0.5, 0, 1), p(0.5, 0, -1), p(0, 0, -1)];
    expect(bounded(clipRing(ring))).toBe(true);
  });

  test('returns nothing for a ring fully off screen', () => {
    expect(clipRing([p(5, 5), p(6, 5), p(6, 6)])).toEqual([]);
  });
});

describe('clipPath', () => {
  test('splits a line that leaves and re-enters the view into two pieces', () => {
    const pieces = clipPath([p(0, 0), p(10, 0), p(10, 0.5), p(0, 0.5)]);
    expect(pieces).toHaveLength(2);
    pieces.forEach(piece => expect(bounded(piece)).toBe(true));
  });

  test('keeps a visible line as one piece', () => {
    const line = [p(0, 0), p(0.5, 0), p(0.5, 0.5)];
    expect(clipPath(line)).toEqual([line]);
  });
});
