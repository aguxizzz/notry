// Fog that opens toward a far POI on the 3D map (mapScene.js). The map only
// reaches ~3 km, so for a place further out the scene loads a low-detail
// ground on the way there and lays this veil on top: sky-colored everywhere
// except around the loteo, along a straight lane to the place and around it.
// A mesh instead of a fog shader, same idea as the perímetro's veil
// (surfaceLayer.js): built-in materials keep their stock fog untouched.
import * as THREE from 'three';

// Vertices per side of the veil grid. Alpha is interpolated between them, so
// the cells only need to be well under the feathers below (~100-200 m).
const GRID = 192;
// Graded veil reach past the farthest clear point: far beyond every feather,
// so the grid's own edge is fully fogged. Past it, a plain opaque frame.
const MARGIN_M = 4000;
// The frame's outer edge. A far place puts the camera 10+ km behind the
// loteo, and whole map tiles stick out well past the veil grid.
const FRAME_M = 200000;
// After ground, surfaces, lot fills/borders and the buildings (2.5), before
// the lot numbers (3, 4). It can't share the buildings' 2.5: three.js then
// sorts the two by their geometry's center, and the veil's sits out toward
// the place, so it was drawn first and the far buildings ended up on top.
const VEIL_ORDER = 2.75;

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Clear area for a POI at local (x, z), in meters. The lane widens with the
 * distance so it still reads from the camera height a far place needs; the
 * loteo keeps a disk of `originRadius` (its own size plus some context).
 */
export function corridorShape({ x, z }, originRadius) {
  const length = Math.hypot(x, z);
  return {
    x, z, length,
    origin: { r: originRadius, feather: 700 },
    lane: { half: Math.min(600, Math.max(180, length * 0.05)), feather: 500 },
    end: { r: 450, feather: 600 },
  };
}

/** Veil amount at local (px, pz): 0 = clear, 1 = fogged. */
export function fogAt(shape, px, pz) {
  const { x, z, length, origin, lane, end } = shape;
  // Closest point on the segment loteo → POI.
  const t = length ? Math.min(1, Math.max(0, (px * x + pz * z) / (length * length))) : 0;
  const dLane = Math.hypot(px - t * x, pz - t * z);
  const dOrigin = Math.hypot(px, pz);
  const dEnd = Math.hypot(px - x, pz - z);
  // Each zone is clear inside its radius and fades out over its feather;
  // the veil is whatever none of them clears.
  const clear = Math.max(
    1 - smoothstep(origin.r, origin.r + origin.feather, dOrigin),
    1 - smoothstep(lane.half, lane.half + lane.feather, dLane),
    1 - smoothstep(end.r, end.r + end.feather, dEnd),
  );
  return 1 - clear;
}

/** Local-meter bounds the corridor needs ground for: both ends plus the clear margins. */
export function corridorBounds(shape, pad = 1500) {
  return {
    minX: Math.min(0, shape.x) - pad,
    maxX: Math.max(0, shape.x) + pad,
    minZ: Math.min(0, shape.z) - pad,
    maxZ: Math.max(0, shape.z) + pad,
  };
}

/**
 * The veil mesh: a flat grid with the fog amount as per-vertex alpha, in the
 * sky's color. Drawn late and without depth test so it covers every ground
 * layer (no z-fighting at 10+ km); the lots sit in the clear disk anyway.
 * `setOpacity(0-1)` fades the whole veil in and out; `opacity` reads it back.
 */
export function createCorridorVeil(shape, color) {
  const minX = Math.min(0, shape.x) - MARGIN_M;
  const maxX = Math.max(0, shape.x) + MARGIN_M;
  const minZ = Math.min(0, shape.z) - MARGIN_M;
  const maxZ = Math.max(0, shape.z) + MARGIN_M;
  const geom = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, GRID, GRID);
  geom.rotateX(-Math.PI / 2);
  geom.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);

  // RGBA vertex colors: white (the material color tints it) + fog as alpha.
  const pos = geom.attributes.position;
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i += 1) {
    rgba.set([1, 1, 1, fogAt(shape, pos.getX(i), pos.getZ(i))], i * 4);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(rgba, 4));

  const material = new THREE.MeshBasicMaterial({
    color, vertexColors: true, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.renderOrder = VEIL_ORDER;
  mesh.frustumCulled = false;

  // Opaque frame around the grid, out to FRAME_M: a big square with the
  // grid's rectangle as a hole. In (east, north), rotated flat like the grid.
  const outer = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector2(a * FRAME_M, b * FRAME_M)));
  outer.holes.push(new THREE.Path([
    new THREE.Vector2(minX, -maxZ), new THREE.Vector2(minX, -minZ),
    new THREE.Vector2(maxX, -minZ), new THREE.Vector2(maxX, -maxZ),
  ]));
  const frameGeom = new THREE.ShapeGeometry(outer);
  frameGeom.rotateX(-Math.PI / 2); // (east, north) → (x, 0, z) with north on -z
  const frameMaterial = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const frame = new THREE.Mesh(frameGeom, frameMaterial);
  frame.renderOrder = VEIL_ORDER;
  frame.frustumCulled = false;
  mesh.add(frame);

  return {
    mesh,
    get opacity() { return material.opacity; }, // where a crossfade to another place starts from
    setOpacity: (v) => { material.opacity = v; frameMaterial.opacity = v; },
    setColor: (c) => { material.color.set(c); frameMaterial.color.set(c); },
    dispose: () => { geom.dispose(); material.dispose(); frameGeom.dispose(); frameMaterial.dispose(); },
  };
}
