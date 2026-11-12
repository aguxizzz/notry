// Pure geometry for editing a lot's vertices on the plano (insert on an edge,
// delete a corner, slide a whole edge). BlueprintEditor feeds it screen-pixel
// points so distances aren't skewed by the plano's aspect ratio, then converts
// back to normalized.

/** Minimum corners a lot can keep: below 3 it isn't an area anymore. */
export const MIN_VERTICES = 3;

// Below this sine (~6°) a neighbor edge counts as parallel to the moved one:
// intersecting them would throw the corner far away, so it just shifts instead.
const MIN_SLIDE_SINE = 0.1;

/**
 * Closest point to `p` on segment a→b. Returns { x, y, t } where t ∈ [0, 1]
 * is how far along the segment it falls (0 = a, 1 = b). A zero-length
 * segment returns `a`.
 */
export function projectOntoSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

/** New point list with `pt` inserted on edge `edgeIndex` (between corner i and i+1). */
export function insertVertex(pixels, edgeIndex, pt) {
  const next = pixels.map(p => [...p]);
  next.splice(edgeIndex + 1, 0, pt);
  return next;
}

/** New point list without corner `index`, or null if that would leave fewer than 3. */
export function removeVertex(pixels, index) {
  if (pixels.length <= MIN_VERTICES || index < 0 || index >= pixels.length) return null;
  return pixels.filter((_, i) => i !== index);
}

/** Unit normal of edge i→i+1 ({ x, y }), or null for a zero-length edge. */
export function edgeNormal(points, edgeIndex) {
  const [ax, ay] = points[edgeIndex];
  const [bx, by] = points[(edgeIndex + 1) % points.length];
  const len = Math.hypot(bx - ax, by - ay);
  if (len === 0) return null;
  return { x: -(by - ay) / len, y: (bx - ax) / len };
}

/**
 * Where line p + t·r crosses line q + u·s, or null when they're (nearly)
 * parallel. Lines, not segments: the corner may slide past the old end.
 */
function intersectLines(p, r, q, s) {
  const cross = r[0] * s[1] - r[1] * s[0];
  const sine = Math.abs(cross) / (Math.hypot(...r) * Math.hypot(...s) || 1);
  if (sine < MIN_SLIDE_SINE) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross;
  return [p[0] + t * r[0], p[1] + t * r[1]];
}

/**
 * The straight face around edge i→i+1: that edge plus the neighbor edges
 * that continue the same line (every point within `tolerance` of the chord).
 * That way a side with an extra point in the middle is picked as one face.
 * Returns { start, end }: corner indices, the face runs forward start→end.
 */
export function faceAround(points, edgeIndex, tolerance) {
  const n = points.length;
  let start = edgeIndex;
  let end = (edgeIndex + 1) % n;
  const straight = (s, e) => {
    const [ax, ay] = points[s];
    const [bx, by] = points[e];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) return false;
    for (let i = s; i !== e; i = (i + 1) % n) {
      const [px, py] = points[i];
      if (Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / len > tolerance) return false;
    }
    return true;
  };
  const edgeCount = () => (end - start + n) % n;
  // Stop one short of the whole ring: a face needs corners outside it to slide on.
  while (edgeCount() < n - 2 && straight((start - 1 + n) % n, end)) start = (start - 1 + n) % n;
  while (edgeCount() < n - 2 && straight(start, (end + 1) % n)) end = (end + 1) % n;
  return { start, end };
}

/**
 * Moves the face start→end (see faceAround) by `drag` ({ x, y }) keeping it
 * parallel to itself: only the part of the drag perpendicular to the face
 * counts. The points in between move with it; its two end corners slide
 * along the neighbor edges, so the lot stays closed and those edges keep
 * their direction. A neighbor parallel to the face can't be slid on; that
 * corner just shifts with the face.
 */
export function slideFace(points, start, end, drag) {
  const n = points.length;
  const a = points[start];
  const b = points[end];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0) return points.map(p => [...p]);
  const normal = { x: -(b[1] - a[1]) / len, y: (b[0] - a[0]) / len };
  const dist = drag.x * normal.x + drag.y * normal.y;
  const shift = p => [p[0] + normal.x * dist, p[1] + normal.y * dist];

  const out = points.map(p => [...p]);
  for (let i = (start + 1) % n; i !== end; i = (i + 1) % n) out[i] = shift(points[i]);
  const prev = points[(start - 1 + n) % n];
  const next = points[(end + 1) % n];
  const dir = [b[0] - a[0], b[1] - a[1]];
  // Each end corner = shifted face line ∩ the neighbor edge's line (through the old corner).
  out[start] = intersectLines(shift(a), dir, prev, [a[0] - prev[0], a[1] - prev[1]]) ?? shift(a);
  out[end] = intersectLines(shift(b), dir, b, [next[0] - b[0], next[1] - b[1]]) ?? shift(b);
  return out;
}

/** slideFace for a single edge i→i+1. */
export function slideEdge(points, edgeIndex, drag) {
  return slideFace(points, edgeIndex, (edgeIndex + 1) % points.length, drag);
}

/**
 * Directions the lot is drawn along: one unit vector per edge, minus the
 * edges in `skipEdges`, with near-duplicates (same angle within ~2°, either
 * way round) merged. These are the alignment axes for the snap: on a rotated
 * plano they're the lot's own sides, not the screen's X/Y.
 */
export function lotDirections(points, skipEdges = []) {
  const dirs = [];
  points.forEach((_, i) => {
    if (skipEdges.includes(i)) return;
    const n = edgeNormal(points, i);
    if (!n) return;
    const d = { x: n.y, y: -n.x }; // edge direction = normal rotated back 90°
    const dup = dirs.some(o => Math.abs(o.x * d.y - o.y * d.x) < 0.035); // sin(2°)
    if (!dup) dirs.push(d);
  });
  return dirs;
}

/** Distance from p to the infinite line through q along unit direction d. */
function distToLine(p, q, d) {
  return Math.abs((p[0] - q[0]) * d.y - (p[1] - q[1]) * d.x);
}

/**
 * Free snap for a dragged corner: if p sits within `threshold` of a line
 * through an anchor along one of `dirs`, it's pulled onto that line; with
 * two such lines in different directions it goes to where they cross.
 * Returns { point, guides: [{ q, d }] } (guides empty = no snap).
 */
export function snapPoint(p, anchors, dirs, threshold) {
  const hits = [];
  for (const q of anchors) {
    for (const d of dirs) {
      const dist = distToLine(p, q, d);
      if (dist < threshold) hits.push({ q, d, dist });
    }
  }
  if (!hits.length) return { point: p, guides: [] };
  hits.sort((a, b) => a.dist - b.dist);
  const first = hits[0];

  // Second line: closest one that isn't parallel to the first and whose
  // crossing stays near the cursor (a shallow angle would throw it far off).
  for (const second of hits.slice(1)) {
    const x = intersectLines(first.q, [first.d.x, first.d.y], second.q, [second.d.x, second.d.y]);
    if (x && Math.hypot(x[0] - p[0], x[1] - p[1]) < threshold * 2) {
      return { point: x, guides: [first, second].map(({ q, d }) => ({ q, d })) };
    }
  }
  // Only one line: drop p onto it perpendicularly.
  const t = (p[0] - first.q[0]) * first.d.x + (p[1] - first.q[1]) * first.d.y;
  return {
    point: [first.q[0] + t * first.d.x, first.q[1] + t * first.d.y],
    guides: [{ q: first.q, d: first.d }],
  };
}

/**
 * Snap for a point that has to stay on segment a→b (the ghost point of a
 * new corner): it jumps to where a line through an anchor along one of
 * `dirs` crosses the segment, if that's within `threshold` of p. This is
 * what lines up a new point with its pair on the opposite side of the lot.
 * Returns { point, guides } like snapPoint.
 */
export function snapOnSegment(p, a, b, anchors, dirs, threshold) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (len2 === 0) return { point: p, guides: [] };
  let best = null;
  for (const q of anchors) {
    for (const d of dirs) {
      const x = intersectLines(a, ab, q, [d.x, d.y]);
      if (!x) continue;
      const t = ((x[0] - a[0]) * ab[0] + (x[1] - a[1]) * ab[1]) / len2;
      if (t <= 0 || t >= 1) continue; // past the ends it would land on the corner itself
      const dist = Math.hypot(x[0] - p[0], x[1] - p[1]);
      if (dist < threshold && (!best || dist < best.dist)) best = { point: x, q, d, dist };
    }
  }
  return best ? { point: best.point, guides: [{ q: best.q, d: best.d }] } : { point: p, guides: [] };
}
