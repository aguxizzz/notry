// Clips PSV polygon/polyline markers to the screen before drawing them.
// Replaces the markers-plugin MarkerPolygon render, which sent coordinates in
// the millions of px to the <svg> for huge shapes (worse when zoomed in).
import { Matrix4 } from 'three';

// Clip margin in clip space: 1.2 = 10% past each screen edge, so the cut
// edges (and their stroke) stay out of view.
const MARGIN = 1.2;
// Minimum w: drops whatever is behind (or exactly beside) the camera.
const MIN_W = 1e-6;

// Half-spaces in homogeneous coords [x, y, z, w]; a point is visible when all
// of them are >= 0. They are linear, so cutting an edge is just a lerp.
const PLANES = [
  p => MARGIN * p[3] - p[0],
  p => MARGIN * p[3] + p[0],
  p => MARGIN * p[3] - p[1],
  p => MARGIN * p[3] + p[1],
  p => p[3] - MIN_W,
];

const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

/**
 * Sutherland–Hodgman: clips a closed ring against every plane. The edges it
 * adds lie on the margin border, outside the visible area.
 */
export function clipRing(ring) {
  let out = ring;
  for (const f of PLANES) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) out.push(lerp(a, b, fa / (fa - fb)));
    }
  }
  return out;
}

/**
 * Liang–Barsky per edge: clips an open line and returns the visible pieces
 * separately (joining them with a straight line could cross the screen).
 */
export function clipPath(path) {
  const pieces = [];
  let current = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    let t0 = 0;
    let t1 = 1;
    let hidden = false;
    for (const f of PLANES) {
      const fa = f(a);
      const fb = f(b);
      if (fa < 0 && fb < 0) { hidden = true; break; }
      if (fa < 0) t0 = Math.max(t0, fa / (fa - fb));       // edge enters through this plane
      else if (fb < 0) t1 = Math.min(t1, fa / (fa - fb));  // edge leaves through this plane
    }
    if (hidden || t0 > t1) { current = null; continue; }
    // An edge that starts clipped opens a new piece even if the previous one is still open.
    if (!current || t0 > 0) {
      current = [t0 > 0 ? lerp(a, b, t0) : a];
      pieces.push(current);
    }
    current.push(t1 < 1 ? lerp(a, b, t1) : b);
    if (t1 < 1) current = null;
  }
  return pieces;
}

const viewProj = new Matrix4();

// Vector3 → [x, y, z, w] in clip space, before the divide by w (which is
// exactly what blows up points near or behind the camera).
function toClip(v, e) {
  return [
    e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12],
    e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13],
    e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14],
    e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15],
  ];
}

/**
 * Drop-in for MarkerPolygon.render(). Same contract as the original (sets the
 * <path> `d` and returns a screen position, or null when hidden), but with the
 * shape already clipped to the visible area. Straight lines through the
 * camera center project as straight lines, so clipping before projecting
 * draws exactly what PSV would, just bounded.
 */
function renderClipped() {
  const { camera } = this.viewer.renderer;
  const { width, height } = this.viewer.state.size;
  const e = viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;

  const pieces = [];
  if (this.isPolygon) {
    // Each ring (outline and holes) is clipped on its own.
    this.positions3D.forEach(ring => {
      const clipped = clipRing(ring.map(v => toClip(v, e)));
      if (clipped.length > 2) pieces.push(clipped);
    });
  } else {
    clipPath(this.positions3D[0].map(v => toClip(v, e)))
      .forEach(piece => { if (piece.length > 1) pieces.push(piece); });
  }
  if (!pieces.length) return null;

  const toScreen = p => [
    Math.round((p[0] / p[3] + 1) / 2 * width),
    Math.round((1 - p[1] / p[3]) / 2 * height),
  ];
  const close = this.isPolygon ? 'Z' : '';
  const d = pieces
    .map(piece => 'M' + piece.map(p => toScreen(p).join(',')).join('L') + close)
    .join(' ');

  // Absolute coords: the original translated to the centroid, which could also
  // land millions of px away when zoomed in and lose precision in the svg.
  this.domElement.setAttributeNS(null, 'd', d);
  this.domElement.setAttributeNS(null, 'transform', 'translate(0 0)');

  // PSV uses this position for static tooltips; the first visible point is enough.
  const [x, y] = toScreen(pieces[0][0]);
  return { x, y };
}

let installed = false;

/**
 * Hooks the clipped render into the plugin. MarkerPolygon isn't exported, so
 * its prototype is patched from the first poly marker that gets added (one
 * patch covers every viewer on the page).
 */
export function installPolygonClipping(plugin) {
  const addMarker = plugin.addMarker.bind(plugin);
  plugin.addMarker = (config, render) => {
    const result = addMarker(config, render);
    if (!installed) {
      const marker = plugin.getMarker(config.id);
      if (marker?.isPoly?.()) {
        Object.getPrototypeOf(marker).render = renderClipped;
        installed = true;
      }
    }
    return result;
  };
}
