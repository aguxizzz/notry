// courtFrame / courtLines: where a court's lines go inside the polygon drawn for it.
import { describe, expect, test } from 'vitest';
import { amenityTextItems, courtFrame, courtLines } from './amenityLayer.js';

// A 20 × 10 m rectangle turned 30°, like a pádel court drawn at an angle.
const A = Math.PI / 6;
const rotated = [[-10, -5], [10, -5], [10, 5], [-10, 5]]
  .map(([x, z]) => [x * Math.cos(A) - z * Math.sin(A), x * Math.sin(A) + z * Math.cos(A)]);

describe('courtFrame', () => {
  test('runs along the longest side, with the real size', () => {
    const f = courtFrame(rotated);
    expect(f.length).toBeCloseTo(20);
    expect(f.width).toBeCloseTo(10);
    expect(Math.abs(f.u[0] * Math.cos(A) + f.u[1] * Math.sin(A))).toBeCloseTo(1); // u ∥ the 20 m side
    expect(f.center[0]).toBeCloseTo(0);
    expect(f.center[1]).toBeCloseTo(0);
  });

  test('a long side drawn first or last gives the same frame', () => {
    const f = courtFrame([[0, 0], [0, 30], [8, 30], [8, 0]]);
    expect(f.length).toBeCloseTo(30);
    expect(f.width).toBeCloseTo(8);
  });
});

describe('amenityTextItems', () => {
  // Fake measure: every character 0.6 m wide at size 1.
  const measure = text => text.length * 0.6;
  const item = (extra) => ({ id: 'a', ring: [[0, 0], [30, 0], [30, 10], [0, 10]], label: [15, 5], form: 'piso', ...extra });

  test('an elongated shape gets its name along the long side, fitted to it', () => {
    const [t] = amenityTextItems([item({ name: 'Estacionamiento' })], measure);
    expect(t.angle).toBeCloseTo(0);
    expect(t.size * measure(t.text)).toBeLessThanOrEqual(30 * 0.8 + 1e-9);
    expect(t.size).toBeLessThanOrEqual(10 * 0.4 + 1e-9);
    expect(t).toMatchObject({ x: 15, z: 5, y: 0 });
  });

  test('a squarish one stays upright and fits its short side', () => {
    const square = { ring: [[0, 0], [12, 0], [12, 10], [0, 10]] };
    const [t] = amenityTextItems([item({ ...square, name: 'Juegos' })], measure);
    expect(t.angle).toBeNull();
    expect(t.size * measure(t.text)).toBeLessThanOrEqual(10 * 0.8 + 1e-9);
  });

  test('an edificio writes on its roof; no name falls back to the icon name, none at all is skipped', () => {
    const [roof] = amenityTextItems([item({ form: 'edificio', floors: 2, name: 'Club House' })], measure);
    expect(roof.y).toBeCloseTo(6.05);
    expect(amenityTextItems([item({ icon: 'pileta' })], measure)[0].text).toBe('Pileta');
    expect(amenityTextItems([item({ name: '  ' })], measure)).toEqual([]);
  });

  test('dark letters on a light ground, white on a dark one', () => {
    const [roof, court] = amenityTextItems([
      item({ form: 'edificio', name: 'Guardia' }),
      item({ form: 'cancha', sport: 'padel', name: 'Pádel' }),
    ], measure);
    expect(roof.color).not.toBe('#ffffff');
    expect(court.color).toBe('#ffffff');
  });
});

describe('courtLines', () => {
  const inside = ([x, z]) => {
    // Back to the court's own axes: every line has to fall inside the 20 × 10 box.
    const s = x * Math.cos(A) + z * Math.sin(A);
    const t = -x * Math.sin(A) + z * Math.cos(A);
    return Math.abs(s) <= 10 + 1e-9 && Math.abs(t) <= 5 + 1e-9;
  };

  test.each(['padel', 'tenis', 'futbol', 'basquet'])('%s lines stay inside the polygon', (sport) => {
    const segs = courtLines(rotated, sport);
    expect(segs.length).toBeGreaterThan(5);
    expect(segs.flat().every(inside)).toBe(true);
  });

  test('a skewed 4-point court gets its lines stretched onto its own corners', () => {
    // Trapezoid: 20 m along the bottom, 16 m along the top, short sides drawn first.
    const quad = [[0, 0], [0, 10], [18, 10], [20, 0]];
    const segs = courtLines(quad, 'padel');
    // The outline (inset by the margin) ends near each corner, not at a box around them.
    const ends = segs.flat();
    const near = ([cx, cz]) => Math.min(...ends.map(([x, z]) => Math.hypot(x - cx, z - cz)));
    for (const corner of quad) expect(near(corner)).toBeLessThan(1);
    // Nothing falls outside the slanted side (x = 20 - z/5).
    expect(ends.every(([x, z]) => x <= 20 - z / 5 + 1e-9)).toBe(true);
  });

  test('an unknown sport still gets the outline and the middle line', () => {
    expect(courtLines(rotated, 'hockey')).toHaveLength(5);
  });
});
