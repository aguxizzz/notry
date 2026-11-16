// The verde/agua border: rounded and waved from the clicked polygon, and the
// same every time for the same shape (the editor and the visor must match).
import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { naturalOutline, naturalShape } from './naturalOutline.js';

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
const maxDistFromCenter = ring => Math.max(...ring.map(([x, y]) => Math.hypot(x - 50, y - 50)));

describe('naturalOutline', () => {
  it('with curve and wobble at 0 it is the polygon as clicked', () => {
    expect(naturalOutline(square, {})).toBe(square);
  });

  it('curve rounds the corners in: no point reaches them anymore', () => {
    const ring = naturalOutline(square, { curve: 1 });
    expect(ring.length).toBeGreaterThan(square.length);
    expect(maxDistFromCenter(ring)).toBeLessThan(Math.hypot(50, 50) - 5);
  });

  it('wobble moves the straight sides, and the same seed gives the same border', () => {
    const a = naturalOutline(square, { wobble: 1, seed: 'v1' });
    const b = naturalOutline(square, { wobble: 1, seed: 'v1' });
    const c = naturalOutline(square, { wobble: 1, seed: 'v2' });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Some point of the bottom side's samples left the line y = 0.
    const bottom = a.filter(([, y]) => Math.abs(y) < 20);
    expect(bottom.some(([, y]) => Math.abs(y) > 0.5)).toBe(true);
    // Bounded: at most 6% of the size (√area = 100) away from the original sides.
    for (const [x, y] of a) {
      expect(x).toBeGreaterThan(-6.01);
      expect(y).toBeLessThan(106.01);
    }
  });

  it('curve rounds hard even when the shape has many short clicks', () => {
    // A square drawn with a click every 10 units: Chaikin barely touched it.
    const dense = [];
    for (let i = 0; i < 10; i++) dense.push([i * 10, 0]);
    for (let i = 0; i < 10; i++) dense.push([100, i * 10]);
    for (let i = 0; i < 10; i++) dense.push([100 - i * 10, 100]);
    for (let i = 0; i < 10; i++) dense.push([0, 100 - i * 10]);
    const ring = naturalOutline(dense, { curve: 1 });
    expect(maxDistFromCenter(ring)).toBeLessThan(Math.hypot(50, 50) - 10);
  });

  it('wobble keeps a jagged shape in one piece: the border never crosses itself', () => {
    // Clicked like the reserve in the satellite view: notches and spikes.
    const jagged = [[0, 0], [300, 0], [310, 40], [260, 60], [300, 120], [290, 200],
      [200, 210], [205, 180], [150, 215], [120, 190], [60, 230], [40, 200], [55, 190], [0, 210]];
    for (const curve of [0, 0.5, 1]) {
      for (const seed of ['a', 'b', 'c']) {
        const ring = naturalOutline(jagged, { curve, wobble: 1, seed });
        expect(selfIntersects(ring)).toBe(false);
      }
    }
  });
});

describe('naturalShape (kept off lots and streets)', () => {
  const close = ring => [...ring, ring[0]];
  const overlapArea = (pieces, obstacle) => pieces.reduce((sum, { outer, holes }) => {
    const shape = [close(outer), ...holes.map(close)];
    return sum + polygonClipping.intersection([shape], [close(obstacle)])
      .reduce((s2, [o]) => s2 + Math.abs(shoelace(o)), 0);
  }, 0);

  it('never covers a lot drawn right next to it, whatever the curve and wobble', () => {
    // The lot touches the right side of the square.
    const lot = [[100, 20], [130, 20], [130, 60], [100, 60]];
    for (const curve of [0, 0.6, 1]) {
      for (const wobble of [0, 0.5, 1]) {
        const pieces = naturalShape(square, { curve, wobble, seed: 'v', obstacles: [lot] });
        expect(pieces.length).toBeGreaterThan(0);
        expect(overlapArea(pieces, lot)).toBeLessThan(1e-6);
      }
    }
  });

  it('keeps the drawn side straight next to the lot instead of waving it', () => {
    const lot = [[100, 0], [130, 0], [130, 100], [100, 100]];
    const pieces = naturalShape(square, { curve: 0, wobble: 1, seed: 'v', obstacles: [lot] });
    // The strip along the lot stays fully covered: the edge didn't wave inward.
    // (The clipped ring has no points mid-side to check, collinear ones are dropped.)
    const strip = [[97, 30], [100, 30], [100, 70], [97, 70]];
    expect(overlapArea(pieces, strip)).toBeGreaterThan(3 * 40 * 0.98);
  });

  it('a street across it splits it in two; a lot inside it leaves a hole', () => {
    const street = [[-10, 45], [110, 45], [110, 55], [-10, 55]];
    expect(naturalShape(square, { obstacles: [street] })).toHaveLength(2);
    const inner = [[40, 40], [60, 40], [60, 60], [40, 60]];
    const [piece] = naturalShape(square, { obstacles: [inner] });
    expect(piece.holes).toHaveLength(1);
  });

  it('far from every obstacle it is the plain natural outline', () => {
    const farLot = [[500, 500], [520, 500], [520, 520], [500, 520]];
    const [{ outer }] = naturalShape(square, { curve: 0.6, wobble: 0.5, seed: 'v', obstacles: [farLot] });
    expect(outer).toEqual(naturalOutline(square, { curve: 0.6, wobble: 0.5, seed: 'v' }));
  });
});

function shoelace(ring) {
  return ring.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0) / 2;
}

/** True if two non-adjacent sides of the closed ring cross. */
function selfIntersects(ring) {
  const n = ring.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // these two share the closing point
      const c = ring[j], d = ring[(j + 1) % n];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}
