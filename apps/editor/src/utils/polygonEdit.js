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
 * Moves edge i→i+1 by `drag` ({ x, y }) keeping it parallel to itself: only
 * the part of the drag perpendicular to the edge counts. Its two corners
 * slide along the neighbor edges, so the lot stays closed and those edges
 * keep their direction. A neighbor parallel to the edge can't be slid on;
 * that corner just shifts with the edge.
 */
export function slideEdge(points, edgeIndex, drag) {
  const n = points.length;
  const normal = edgeNormal(points, edgeIndex);
  if (!normal) return points.map(p => [...p]);

  const dist = drag.x * normal.x + drag.y * normal.y;
  const ia = edgeIndex;
  const ib = (edgeIndex + 1) % n;
  const a = points[ia];
  const b = points[ib];
  const prev = points[(ia - 1 + n) % n];
  const next = points[(ib + 1) % n];
  const dir = [b[0] - a[0], b[1] - a[1]];
  const a2 = [a[0] + normal.x * dist, a[1] + normal.y * dist];
  const b2 = [b[0] + normal.x * dist, b[1] + normal.y * dist];

  const out = points.map(p => [...p]);
  // Each corner = shifted edge line ∩ the neighbor edge's line (through the old corner).
  out[ia] = intersectLines(a2, dir, prev, [a[0] - prev[0], a[1] - prev[1]]) ?? a2;
  out[ib] = intersectLines(b2, dir, b, [next[0] - b[0], next[1] - b[1]]) ?? b2;
  return out;
}
