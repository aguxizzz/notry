// Tests for the plano's vertex editing geometry (utils/polygonEdit.js).
import { describe, expect, it } from 'vitest';
import {
  faceAround, insertVertex, projectOntoSegment, removeVertex, slideEdge, slideFace,
} from './polygonEdit';

describe('projectOntoSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('drops a point perpendicular onto the segment', () => {
    expect(projectOntoSegment({ x: 4, y: 7 }, a, b)).toEqual({ x: 4, y: 0, t: 0.4 });
  });

  it('clamps to the ends instead of running past them', () => {
    expect(projectOntoSegment({ x: -5, y: 1 }, a, b)).toEqual({ x: 0, y: 0, t: 0 });
    expect(projectOntoSegment({ x: 15, y: 1 }, a, b)).toEqual({ x: 10, y: 0, t: 1 });
  });

  it('works on a diagonal edge', () => {
    const p = projectOntoSegment({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
  });

  it('returns the start of a zero-length segment', () => {
    expect(projectOntoSegment({ x: 3, y: 3 }, a, a)).toEqual({ x: 0, y: 0, t: 0 });
  });
});

describe('insertVertex / removeVertex', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it('inserts after the edge start, including the closing edge', () => {
    expect(insertVertex(square, 0, [0.5, 0])).toEqual([[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]]);
    expect(insertVertex(square, 3, [0, 0.5])).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0.5]]);
  });

  it('does not mutate the original', () => {
    insertVertex(square, 0, [0.5, 0]);
    expect(square).toHaveLength(4);
  });

  it('removes a corner but refuses to go below a triangle', () => {
    expect(removeVertex(square, 1)).toEqual([[0, 0], [1, 1], [0, 1]]);
    expect(removeVertex([[0, 0], [1, 0], [1, 1]], 0)).toBeNull();
    expect(removeVertex(square, 9)).toBeNull();
  });
});

describe('slideEdge', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const close = (pts, expected) => pts.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(expected[i][0]);
    expect(p[1]).toBeCloseTo(expected[i][1]);
  });

  it('moves an edge perpendicular to itself and ignores the drag along it', () => {
    // Edge 1 is the right side (x = 10); a diagonal drag only moves it in x.
    close(slideEdge(square, 1, { x: 3, y: 5 }), [[0, 0], [13, 0], [13, 10], [0, 10]]);
  });

  it('slides the corners along slanted neighbor edges', () => {
    // Trapezoid: top edge (index 2→3 here is the top, y = 10) between two slanted sides.
    const trap = [[0, 0], [10, 0], [8, 10], [2, 10]];
    // Pull the top edge down to y = 5: the corners land halfway down the slanted sides.
    close(slideEdge(trap, 2, { x: 0, y: -5 }), [[0, 0], [10, 0], [9, 5], [1, 5]]);
  });

  it('shifts a corner straight when its neighbor is parallel to the edge', () => {
    // Edge 1 (5,0)→(10,0) is collinear with edge 0, so corner 1 just moves up;
    // corner 2 still slides along the vertical right side.
    const pts = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]];
    close(slideEdge(pts, 1, { x: 0, y: 2 }), [[0, 0], [5, 2], [10, 2], [10, 10], [0, 10]]);
  });

  it('does not mutate the original', () => {
    slideEdge(square, 0, { x: 0, y: 4 });
    expect(square[0]).toEqual([0, 0]);
  });
});

describe('faceAround / slideFace', () => {
  // Rectangle with an extra point in the middle of the top side (index 1).
  const pts = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]];

  it('picks the collinear neighbors as one face', () => {
    expect(faceAround(pts, 0, 0.5)).toEqual({ start: 0, end: 2 });
    expect(faceAround(pts, 1, 0.5)).toEqual({ start: 0, end: 2 });
    // The right side has no straight continuation.
    expect(faceAround(pts, 2, 0.5)).toEqual({ start: 2, end: 3 });
  });

  it('stops at real corners even in a star-like shape', () => {
    const zigzag = [[0, 0], [10, 0], [12, 5], [10, 10], [0, 10]];
    expect(faceAround(zigzag, 1, 0.5)).toEqual({ start: 1, end: 2 });
  });

  it('moves the whole face, including the point in the middle', () => {
    const out = slideFace(pts, 0, 2, { x: 0, y: 3 });
    [[0, 3], [5, 3], [10, 3], [10, 10], [0, 10]].forEach((e, i) => {
      expect(out[i][0]).toBeCloseTo(e[0]);
      expect(out[i][1]).toBeCloseTo(e[1]);
    });
  });
});
