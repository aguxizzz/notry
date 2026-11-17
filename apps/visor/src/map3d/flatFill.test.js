// flatFillGeometry against the real case that broke: demoloteo's merged calles
// (outer contour + one enclosed manzana as a hole), which three's
// ShapeGeometry filled with a wedge 2.5× the street area.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { flatFillGeometry } from './flatFill.js';
import demoloteoCalles from './fixtures/demoloteoCalles.json';

const ringArea = ring => Math.abs(ring.reduce((sum, [x1, z1], i) => {
  const [x2, z2] = ring[(i + 1) % ring.length];
  return sum + (x1 * z2 - x2 * z1);
}, 0)) / 2;

// Area covered by the triangles, plus whether every one faces up (+y).
function triangles(geom) {
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex().array;
  let area = 0;
  let allUp = true;
  const v = i => new THREE.Vector3().fromBufferAttribute(pos, i);
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [v(idx[i]), v(idx[i + 1]), v(idx[i + 2])];
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    area += n.length() / 2;
    if (n.y <= 0) allUp = false;
  }
  return { area, allUp };
}

describe('flatFillGeometry', () => {
  it('fills a street network with a hole without spilling over it', () => {
    const { outer, holes } = demoloteoCalles;
    const expected = ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0);
    const { area, allUp } = triangles(flatFillGeometry([{ outer, holes }]));
    expect(area).toBeCloseTo(expected, 0);
    expect(allUp).toBe(true);
  });

  it('faces up whatever the winding of the input ring', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    for (const outer of [square, [...square].reverse()]) {
      const { area, allUp } = triangles(flatFillGeometry([{ outer }]));
      expect(area).toBeCloseTo(100);
      expect(allUp).toBe(true);
    }
  });
});
