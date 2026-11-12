// Lot detection on synthetic planos: a grid of lots drawn as 1px lines with
// "numbers" inside, checked against the known geometry.
import { describe, expect, it } from 'vitest';
import {
  binarize, detectLotAt, floodFill, removeText, simplifyClosed, toGrayMinPooled, traceBoundary,
} from './lotDetection';

/** Blank w×h ink mask with helpers to draw on it. */
function canvas(w, h) {
  const mask = new Uint8Array(w * h);
  const set = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) mask[y * w + x] = 1; };
  return {
    mask, w, h,
    hline: (y, x0, x1) => { for (let x = x0; x <= x1; x++) set(x, y); },
    vline: (x, y0, y1) => { for (let y = y0; y <= y1; y++) set(x, y); },
    blob: (x0, y0, bw, bh) => { for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) set(x, y); },
  };
}

/** 2×2 lots of 40px inside a 100×100 plano, each with a 6×8 "number". */
function lotGrid() {
  const c = canvas(100, 100);
  for (const v of [10, 50, 90]) { c.hline(v, 10, 90); c.vline(v, 10, 90); }
  c.blob(27, 26, 6, 8);
  c.blob(67, 66, 6, 8);
  return c;
}

const bbox = coords => ({
  minX: Math.min(...coords.map(p => p[0])), maxX: Math.max(...coords.map(p => p[0])),
  minY: Math.min(...coords.map(p => p[1])), maxY: Math.max(...coords.map(p => p[1])),
});

describe('removeText', () => {
  it('drops small blobs and keeps lines', () => {
    const c = lotGrid();
    const { cleaned, text } = removeText(c.mask, c.w, c.h, 20);
    expect(cleaned[30 * 100 + 30]).toBe(0);
    expect(text[30 * 100 + 30]).toBe(1);
    expect(cleaned[10 * 100 + 30]).toBe(1);
    expect(text[10 * 100 + 30]).toBe(0);
  });

  it('stays fast on a large plano with many text blobs', () => {
    // The old version swept the whole image once per blob: this used to hang the tab.
    const c = canvas(2000, 2000);
    for (let y = 5; y < 2000; y += 20) for (let x = 5; x < 2000; x += 20) c.blob(x, y, 4, 6);
    const t0 = performance.now();
    removeText(c.mask, c.w, c.h, 20);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('traceBoundary', () => {
  it('follows the outer border of a rectangle clockwise without repeating', () => {
    const w = 10, h = 10;
    const region = new Uint8Array(w * h);
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) region[y * w + x] = 1;
    const contour = traceBoundary(region, w, h, 2 * w + 3);
    // Perimeter of a 5×4 block = 2*(5+4) - 4 pixels.
    expect(contour).toHaveLength(14);
    expect(new Set(contour.map(p => p.join())).size).toBe(14);
    expect(contour[1]).toEqual([4, 2]); // first move goes east along the top
  });

  it('handles an L shape', () => {
    const w = 12, h = 12;
    const region = new Uint8Array(w * h);
    for (let y = 1; y <= 8; y++) for (let x = 1; x <= 3; x++) region[y * w + x] = 1;
    for (let y = 6; y <= 8; y++) for (let x = 1; x <= 9; x++) region[y * w + x] = 1;
    // The concave corner is cut by a 1px diagonal step (pixel-center tracing);
    // a tolerance of 1px absorbs it, leaving the 6 corners of the L.
    const ring = simplifyClosed(traceBoundary(region, w, h, w + 1), 1);
    expect(ring).toHaveLength(6);
  });
});

describe('detectLotAt', () => {
  const c = lotGrid();
  const masks = { ...removeText(c.mask, c.w, c.h, 20), w: c.w, h: c.h };

  it('outlines the clicked lot as a 4-corner polygon, ignoring the number inside', () => {
    const res = detectLotAt(masks, 0.25, 0.25, 1);
    expect(res.success).toBe(true);
    expect(res.coordinates).toHaveLength(4);
    const b = bbox(res.coordinates);
    expect(b.minX).toBeCloseTo(0.115, 2);
    expect(b.maxX).toBeCloseTo(0.495, 2);
    expect(b.minY).toBeCloseTo(0.115, 2);
    expect(b.maxY).toBeCloseTo(0.495, 2);
  });

  it('rejects a click outside the lots (open to the border)', () => {
    const res = detectLotAt(masks, 0.03, 0.5);
    expect(res.success).toBe(false);
  });

  it('rejects a click right on a line', () => {
    const res = detectLotAt(masks, 0.505, 0.3);
    expect(res.success).toBe(false);
  });

  it('a gap in the dividing line merges the two lots', () => {
    const g = lotGrid();
    for (let y = 20; y < 24; y++) g.mask[y * 100 + 50] = 0;
    const m = { ...removeText(g.mask, g.w, g.h, 20), w: g.w, h: g.h };
    const res = detectLotAt(m, 0.25, 0.25, 1);
    expect(res.success).toBe(true);
    expect(bbox(res.coordinates).maxX).toBeGreaterThan(0.8);
  });
});

describe('toGrayMinPooled', () => {
  it('keeps a 1px line visible after downscaling', () => {
    const w = 400, h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) { const i = (y * w + 201) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; }
    const { gray, w: gw } = toGrayMinPooled(rgba, w, h, 100);
    const mask = binarize(gray, 128);
    expect(gw).toBe(100);
    expect(mask[50]).toBe(1);
  });
});

describe('floodFill', () => {
  it('reports the first raster pixel of the region', () => {
    const c = lotGrid();
    const { firstIdx, reachesEdge } = floodFill(c.mask, c.w, c.h, 70, 30);
    expect(reachesEdge).toBe(false);
    expect(firstIdx).toBe(11 * 100 + 51);
  });
});
