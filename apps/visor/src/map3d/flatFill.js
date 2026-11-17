// Flat fills on the ground (polygons with holes, in local meters) for the map's
// surfaces. Shared with the editor through @map3d. Triangulated with earcut
// 3.2 instead of three's ShapeGeometry: three 0.179 bundles earcut 3.0.1,
// which bridges some holes wrong and paints a big wedge over the map (a
// street network enclosing a manzana did it in demoloteo).
import * as THREE from 'three';
import earcut from 'earcut';

/**
 * One geometry for all `polygons` ([{ outer, holes }], rings as [[x, z], ...]),
 * lying at y = 0 and facing up, so lit materials and shadows work on it.
 */
export function flatFillGeometry(polygons) {
  const positions = [];
  const indices = [];
  for (const { outer, holes = [] } of polygons) {
    if (!outer || outer.length < 3) continue;
    const rings = [outer, ...holes.filter(h => h.length >= 3)];
    const data = rings.flatMap(ring => ring.flatMap(([x, z]) => [x, z]));
    const holeIndices = [];
    let start = outer.length;
    for (const hole of rings.slice(1)) { holeIndices.push(start); start += hole.length; }

    const base = positions.length / 3;
    for (let i = 0; i < data.length; i += 2) positions.push(data[i], 0, data[i + 1]);
    const tris = earcut(data, holeIndices);
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
      // Earcut's winding depends on the input rings; flip whatever would face
      // down (y of (b - a) × (c - a) < 0), or the light would hit its back.
      const ab = [data[2 * b] - data[2 * a], data[2 * b + 1] - data[2 * a + 1]];
      const ac = [data[2 * c] - data[2 * a], data[2 * c + 1] - data[2 * a + 1]];
      const up = ab[1] * ac[0] - ab[0] * ac[1] > 0;
      indices.push(base + a, base + (up ? b : c), base + (up ? c : b));
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Flat ground: every normal points straight up.
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.setIndex(indices);
  return geom;
}
