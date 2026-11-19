// The selected lot raised in 3D on the visor map (mapScene.js): a low block in
// the lot's own status color, so it says "this one" without losing what the
// color means. Chosen on a real loteo over gold, glass and floating looks.
import * as THREE from 'three';
import { lotStatus, STATUS_COLORS } from '../lotData.js';

const HEIGHT_M = 3; // low on purpose: marks the lot without reading as a house

// The raw status colors are meant for translucent fills and read a bit loud
// as a solid. Satellite goes a touch darker to sit with the photo, whose lots
// are the color at 0.35 over dark ground.
const SHADE = { satellite: 0.85, render: 0.92 };

// Drawn right after the lot fills (1) and borders (2) and before the numbers
// (3, 4): the block covers its own lot, and the number, lifted to the top
// with lotLayer.setLift(), still lands on it.
const ORDER = { walls: 2.5, cap: 2.6 };
// Opaque, but flagged transparent on purpose: three draws every opaque object
// before any transparent one, and renderOrder only sorts within each group.
// As a plain opaque mesh the block went first, and the manzanas (transparent,
// no depth test, opacity 1 in render) painted over it: grey in render,
// washed out on satellite. In the transparent group it lands after them.
const SOLID = { transparent: true, opacity: 1, depthWrite: true };

// Signed area in (x, z); its sign says which way the outline runs, needed to
// know which side of each wall faces out.
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

/**
 * Walls as quads with per-vertex colors: the tone comes from how much each
 * wall faces the sun, baked in, on an unlit material, so the mode's light
 * can't grey the block out. Always darker than the top, which is what makes
 * a block with no outline read as a volume.
 */
function buildWalls(pts, color, lightDir) {
  const out = signedArea(pts) > 0 ? 1 : -1;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Outward horizontal normal against the sun: 1 = faces it, -1 = away.
    const lit = ((dz * lightDir.x - dx * lightDir.z) / len) * out;
    c.copy(color).multiplyScalar(0.62 + 0.25 * Math.max(0, lit) + 0.08 * Math.min(0, lit));
    for (const [p, y] of [[a, 0], [b, 0], [b, HEIGHT_M], [a, 0], [b, HEIGHT_M], [a, HEIGHT_M]]) {
      pos.push(p.x, y, p.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...SOLID }));
}

function buildCap(pts, color) {
  // Shape in (east, north); rotateX(-90°) lays it flat, then up to the top.
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, HEIGHT_M, 0);
  return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...SOLID }));
}

/**
 * Builds the block for a lot entry ({ lot, pts }) in `mode`'s shade.
 * `lightDir` is the sun's direction (only its horizontal part shades the
 * walls). Returns a Group whose scale.y grows it from the ground, and
 * `labelHeight`, where the lot's number should sit.
 */
export function createLotBlock(entry, mode, { lightDir }) {
  const color = new THREE.Color(STATUS_COLORS[lotStatus(entry.lot)]).multiplyScalar(SHADE[mode] ?? 1);
  const flat = new THREE.Vector3(lightDir.x, 0, lightDir.z).normalize();

  const walls = buildWalls(entry.pts, color, flat);
  const cap = buildCap(entry.pts, color);
  walls.renderOrder = ORDER.walls;
  cap.renderOrder = ORDER.cap;
  walls.castShadow = true;
  cap.castShadow = true;

  const group = new THREE.Group();
  group.add(walls, cap);
  return { group, labelHeight: HEIGHT_M };
}
