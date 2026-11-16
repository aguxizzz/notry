// Organic outline for verdes and agua (Loteo.geo_surfaces): the polygon the
// editor stores is made of straight clicks, this turns it into a soft, uneven
// shore. Shared with the editor through @map3d so both draw the same border.
// Works in any 2D space (the editor uses blueprint [0,1]², the visor meters).
//
// Every length below is relative to the shape's size (√area), so the same
// slider value looks the same on a small pond and on a big reserve.
import polygonClipping from 'polygon-clipping';

// Gaussian blur radius (sigma) along the border at curve = 1: a quarter of the
// size turns a square into a rounded blob. Chaikin only rounded next to each
// click, so shapes with many short sides barely changed. The slider goes
// through curve^1.5 so the low end stays fine-grained (60% ≈ 12%).
const CURVE_MAX_SIGMA = 0.25;
const CURVE_EXPONENT = 1.5;
// Blurring a closed curve shrinks it. This much of the lost area is given back
// by pushing the border out evenly; not all of it, or straight sides next to a
// road or the loteo's edge would bulge past where they were drawn.
const CURVE_AREA_RESTORE = 0.5;
// Max in/out shift of the border at wobble = 1. 6% of a 300 m wide reserve is
// 18 m: clearly irregular, but it keeps the shape the user drew.
const WOBBLE_AMPLITUDE = 0.06;
// Longest bump of the irregular edge. Shorter than the shape so it adds detail
// to the edge instead of bending the whole figure (that was the old bug).
const WOBBLE_WAVELENGTH = 0.2;
// Noise layers, each one half the wavelength and half the height of the last:
// big bays with smaller notches on them, like a real tree line or shore.
const WOBBLE_OCTAVES = 4;
// The wobble never pushes a point further than this fraction of the local
// radius of curvature toward its center, so tight bends can't fold over.
const WOBBLE_CURVATURE_LIMIT = 0.7;
// Blur (as a fraction of the size) applied before the wobble, so clicked
// corners are a tiny bit round and have a well defined normal.
const WOBBLE_CORNER_SOFTEN = 0.015;
// Spacing of the resampled border, as a fraction of the size, and the
// limits on the point count (enough detail vs. cheap to redraw on a slider).
const SAMPLE_SPACING = 1 / 90;
const MIN_SAMPLES = 120;
const MAX_SAMPLES = 720;

/** Deterministic 0..1 numbers from a string, so a shape wobbles the same every time it's drawn. */
function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Signed shoelace area: positive when the ring goes counter-clockwise (y up). */
function signedArea(ring) {
  let sum = 0;
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  });
  return sum / 2;
}

function perimeterOf(ring) {
  return ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }, 0);
}

/** `count` points evenly spaced along the closed ring (by length, not by click). */
function resample(ring, count, perimeter) {
  const out = [];
  let side = 0;
  let walked = 0; // perimeter covered by the sides before `side`
  const sideLen = i => {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  let len = sideLen(0);
  for (let i = 0; i < count; i++) {
    const at = (i / count) * perimeter;
    while (at > walked + len && side < ring.length - 1) {
      walked += len;
      len = sideLen(++side);
    }
    const a = ring[side], b = ring[(side + 1) % ring.length];
    const t = len ? (at - walked) / len : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * Gaussian blur of the points along the ring (wraps around, so no seam).
 * `sigma` is in samples; the kernel is cut at 3 sigma.
 */
function blurRing(pts, sigma) {
  if (sigma < 0.5) return pts;
  const n = pts.length;
  // A kernel wider than the ring would count points twice.
  const reach = Math.min(Math.ceil(sigma * 3), Math.floor((n - 1) / 2));
  const weights = [];
  for (let k = -reach; k <= reach; k++) weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  const total = weights.reduce((a, b) => a + b, 0);
  return pts.map((_, i) => {
    let x = 0, y = 0;
    for (let k = -reach; k <= reach; k++) {
      const [px, py] = pts[(i + k + n) % n];
      const w = weights[k + reach];
      x += px * w;
      y += py * w;
    }
    return [x / total, y / total];
  });
}

/**
 * Outward unit normal and signed curvature at each point, from its two
 * neighbours. Curvature > 0 where the border bends around the inside (convex).
 */
function normalsAndCurvature(pts, orientation) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = (b[0] - a[0]) / 2, dy = (b[1] - a[1]) / 2;
    const ddx = b[0] - 2 * p[0] + a[0], ddy = b[1] - 2 * p[1] + a[1];
    const speed = Math.hypot(dx, dy) || 1;
    // Rotating the tangent -90° points out of a counter-clockwise ring.
    const normal = [(dy / speed) * orientation, (-dx / speed) * orientation];
    const curvature = ((dx * ddy - dy * ddx) / speed ** 3) * orientation;
    return { normal, curvature };
  });
}

/** Moves every point along its own outward normal by `offsets[i]`. */
function pushOut(pts, offsets, frame) {
  return pts.map(([x, y], i) => [
    x + frame[i].normal[0] * offsets[i],
    y + frame[i].normal[1] * offsets[i],
  ]);
}

/**
 * Rounds the shape as a whole: blurs the border so corners and small zigzags
 * melt into curves, then gives back part of the area the blur ate.
 */
function curveRing(pts, amount, size, spacing, orientation) {
  const before = Math.abs(signedArea(pts));
  const sigma = amount ** CURVE_EXPONENT * CURVE_MAX_SIGMA * size;
  const blurred = blurRing(pts, sigma / spacing);
  const lost = before - Math.abs(signedArea(blurred));
  if (lost <= 0) return blurred;
  const grow = (CURVE_AREA_RESTORE * lost) / perimeterOf(blurred);
  const frame = normalsAndCurvature(blurred, orientation);
  return pushOut(blurred, blurred.map(() => grow), frame);
}

/**
 * Periodic fractal noise around the ring, -1..1. Each layer is a loop of
 * random values eased between, with a whole number of cells per lap so the
 * start and the end meet without a jump.
 */
function ringNoise(count, cellsPerLap, seed) {
  const rand = seededRandom(seed);
  const layers = [];
  let cells = cellsPerLap, weight = 1;
  for (let o = 0; o < WOBBLE_OCTAVES; o++) {
    layers.push({ cells, weight, values: Array.from({ length: cells }, () => rand() * 2 - 1) });
    cells *= 2;
    weight /= 2;
  }
  const totalWeight = layers.reduce((sum, l) => sum + l.weight, 0);
  return Array.from({ length: count }, (_, i) => {
    let v = 0;
    for (const { cells: c, weight: w, values } of layers) {
      const at = (i / count) * c;
      const k = Math.floor(at);
      const t = at - k;
      const ease = t * t * (3 - 2 * t); // smoothstep: no kinks at the cell edges
      v += w * (values[k % c] + (values[(k + 1) % c] - values[k % c]) * ease);
    }
    return v / totalWeight;
  });
}

/**
 * Makes the edge irregular: pushes each point in or out along its normal,
 * capped by the local curvature so no bend folds over. Works on a lightly
 * smoothed copy of the border: at a sharp clicked corner the normal flips
 * from one side to the other and the pushed points cross each other.
 */
function wobbleRing(pts, amount, size, spacing, perimeter, orientation, seed) {
  const guide = blurRing(pts, (WOBBLE_CORNER_SOFTEN * size) / spacing);
  const frame = normalsAndCurvature(guide, orientation);
  const cells = Math.max(4, Math.round(perimeter / (WOBBLE_WAVELENGTH * size)));
  const noise = ringNoise(pts.length, cells, seed);
  const amp = amount * WOBBLE_AMPLITUDE * size;
  // Moving toward the center of curvature (in on a convex bend, out on a
  // concave one) past the radius is what makes the border loop on itself.
  // Limits per direction: [how far out, how far in] each point may go.
  const n = pts.length;
  const local = frame.map(({ curvature: k }) => {
    const radius = Math.abs(k) > 1e-12 ? WOBBLE_CURVATURE_LIMIT / Math.abs(k) : Infinity;
    return k > 0 ? [Infinity, radius] : [radius, Infinity];
  });
  // The points next to a tight bend also run into it (both sides of a narrow
  // notch), so each point takes the strictest limit within reach of the wobble.
  const reach = Math.ceil((2 * amp) / spacing);
  const offsets = noise.map((v, i) => {
    let maxOut = Infinity, maxIn = Infinity;
    for (let k = -reach; k <= reach; k++) {
      const [out, inward] = local[(i + k + n * (reach + 1)) % n];
      maxOut = Math.min(maxOut, out);
      maxIn = Math.min(maxIn, inward);
    }
    const off = v * amp;
    return off > 0 ? Math.min(off, maxOut) : Math.max(off, -maxIn);
  });
  return pushOut(guide, offsets, frame);
}

/**
 * Curve + wobble on the clicked polygon. Returns the evenly resampled border
 * before (`base`) and after (`ring`): same count, point i of one is point i of
 * the other, so the effect can be faded per point. null when nothing applies.
 */
function shapeRing(points, curve, wobble, seed) {
  if (!points || points.length < 3) return null;
  if (!(curve > 0) && !(wobble > 0)) return null;
  const area = signedArea(points);
  const perimeter = perimeterOf(points);
  if (!perimeter) return null;
  // A zero-area (all clicks in a line) ring has no size to scale from.
  const size = Math.sqrt(Math.abs(area)) || perimeter / 4;
  const orientation = area >= 0 ? 1 : -1;
  const count = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(perimeter / (size * SAMPLE_SPACING))));
  const spacing = perimeter / count;
  const base = resample(points, count, perimeter);
  let ring = base;
  if (curve > 0) ring = curveRing(ring, Math.min(curve, 1), size, spacing, orientation);
  if (wobble > 0) ring = wobbleRing(ring, Math.min(wobble, 1), size, spacing, perimeterOf(ring), orientation, seed);
  return { base, ring, size, spacing };
}

/**
 * The drawn outline of a verde/agua. `curve` and `wobble` go 0..1 (0, or
 * missing, leaves that step out, so curve 0 + wobble 0 is the polygon as
 * clicked). Curve goes first so the irregular edge sits on the rounded shape.
 * `seed` (the shape id) keeps the unevenness stable between redraws.
 */
export function naturalOutline(points, { curve = 0, wobble = 0, seed = '' } = {}) {
  return shapeRing(points, curve, wobble, seed)?.ring ?? points ?? [];
}

// --- Keeping clear of lots and streets ---------------------------------------
// Verdes and agua never cover a lot or a street. Two steps: where the drawn
// border runs next to one, curve/wobble fade out so the edge follows the line
// as drawn (a tree line goes straight up to a fence); whatever still ends up
// on top of one is cut off at the end.

// Within this distance (fraction of the shape's size) of a lot or street the
// border stays as drawn; past FADE_FAR it gets the full effect.
const FADE_NEAR = 0.015;
const FADE_FAR = 0.08;
// Blur of the fade along the border (fraction of the size), so the edge
// doesn't snap from straight to wavy at one point.
const FADE_BLUR = 0.03;

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToRing([px, py], ring) {
  let best = Infinity;
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  });
  return best;
}

function bboxOf(ring) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const bboxesTouch = (a, b, margin) => (
  a[0] - margin <= b[2] && b[0] - margin <= a[2] && a[1] - margin <= b[3] && b[1] - margin <= a[3]
);

/** 0 next to (or inside) an obstacle, 1 far from all of them, smoothed along the ring. */
function fadeWeights(base, obstacles, size, spacing) {
  const near = FADE_NEAR * size, far = FADE_FAR * size;
  const weights = base.map((p) => {
    let d = Infinity;
    for (const ob of obstacles) {
      if (pointInRing(p, ob)) return 0;
      d = Math.min(d, distanceToRing(p, ob));
    }
    const t = Math.max(0, Math.min(1, (d - near) / (far - near)));
    return t * t * (3 - 2 * t);
  });
  // blurRing works on points; the weight rides as x and y is ignored.
  return blurRing(weights.map(w => [w, 0]), (FADE_BLUR * size) / spacing).map(([w]) => w);
}

const closeRing = ring => [...ring.map(([x, y]) => [x, y]), [ring[0][0], ring[0][1]]];
const openRing = ring => ring.slice(0, -1);

/**
 * Like naturalOutline, but kept off `obstacles` (rings of lots and streets, in
 * the same space as `points`). Returns pieces as [{ outer, holes }], biggest
 * first: cutting can split the shape (a street through it) or leave holes (a
 * lot inside it). Empty if the obstacles cover all of it.
 */
export function naturalShape(points, { curve = 0, wobble = 0, seed = '', obstacles = [] } = {}) {
  if (!points || points.length < 3) return [];
  const shaped = shapeRing(points, curve, wobble, seed);
  let ring = shaped?.ring ?? points;
  // Only obstacles that can reach the shape matter: a loteo has hundreds of lots.
  const box = bboxOf(ring);
  const size = shaped?.size ?? Math.sqrt(Math.abs(signedArea(points)));
  const nearby = obstacles.filter(ob => ob?.length >= 3 && bboxesTouch(box, bboxOf(ob), FADE_FAR * size));
  if (!nearby.length) return [{ outer: ring, holes: [] }];
  if (shaped) {
    const w = fadeWeights(shaped.base, nearby, shaped.size, shaped.spacing);
    ring = shaped.base.map(([bx, by], i) => [
      bx + (shaped.ring[i][0] - bx) * w[i],
      by + (shaped.ring[i][1] - by) * w[i],
    ]);
  }
  try {
    const pieces = polygonClipping.difference([closeRing(ring)], ...nearby.map(ob => [closeRing(ob)]));
    return pieces
      .map(([outer, ...holes]) => ({ outer: openRing(outer), holes: holes.map(openRing) }))
      .sort((a, b) => Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer)));
  } catch {
    // polygon-clipping can choke on degenerate input (repeated points, slivers):
    // better a shape that overlaps a little than no shape at all.
    return [{ outer: ring, holes: [] }];
  }
}
