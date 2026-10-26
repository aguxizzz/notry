import { annId, annPoints } from './lotData.js';

/**
 * Lot Border Normalization Algorithm
 *
 * Deduplicates shared/near borders between adjacent lot polygons so each
 * visual line renders exactly once. Solves three problems:
 *
 * 1. Slight vertex misalignments (≤ threshold px) → vertex snapping
 * 2. Same geometric border, different vertex placements → edge-to-edge
 *    proximity matching (colinear + overlapping segments)
 * 3. Corner gaps between consecutive border segments → chain grouping
 *    (consecutive edges merged into one multi-point polyline)
 */

const SNAP_THRESHOLD_PX = 5;

// ─── Geometry helpers ──────────────────────────────────────────────────────

function distance(p1, p2) {
  const dx = p1[0] - p2[0], dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Perpendicular distance from pt to the INFINITE line through lineA → lineB */
function perpDistPointToLine(pt, lineA, lineB) {
  const dx = lineB[0] - lineA[0], dy = lineB[1] - lineA[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return distance(pt, lineA);
  return Math.abs((pt[0] - lineA[0]) * dy - (pt[1] - lineA[1]) * dx) / len;
}

/** Scalar projection of pt onto the direction lineA → lineB */
function projectOnLine(pt, lineA, lineB) {
  const dx = lineB[0] - lineA[0], dy = lineB[1] - lineA[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return 0;
  return ((pt[0] - lineA[0]) * dx + (pt[1] - lineA[1]) * dy) / len;
}

/**
 * Returns true when e1 and e2 are geometrically the same border:
 *  - All 4 endpoints are within `threshold` px of the OTHER edge's infinite line
 *  - The two segments overlap in their extent
 */
function edgesAreNear(e1, e2, threshold) {
  const [a, b] = e1, [c, d] = e2;

  if (perpDistPointToLine(a, c, d) >= threshold) return false;
  if (perpDistPointToLine(b, c, d) >= threshold) return false;
  if (perpDistPointToLine(c, a, b) >= threshold) return false;
  if (perpDistPointToLine(d, a, b) >= threshold) return false;

  // Must overlap along e1's direction
  const len = distance(a, b);
  if (len < 0.001) return false;

  const projC = projectOnLine(c, a, b);
  const projD = projectOnLine(d, a, b);

  const overlapMin = Math.max(0, Math.min(projC, projD));
  const overlapMax = Math.min(len, Math.max(projC, projD));
  return overlapMax > overlapMin + 1.0;
}

// ─── Vertex snapping ───────────────────────────────────────────────────────

function snapVertices(polygons, threshold) {
  const vertices = [];
  polygons.forEach((poly, polyIdx) => {
    poly.points.forEach((pt, ptIdx) => {
      vertices.push({ pt, key: `${polyIdx},${ptIdx}` });
    });
  });

  const parent = vertices.map((_, i) => i);
  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x, y) {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (distance(vertices[i].pt, vertices[j].pt) < threshold) union(i, j);
    }
  }

  const clusters = new Map();
  vertices.forEach((v, idx) => {
    const root = find(idx);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(v);
  });

  const snappedMap = new Map();
  clusters.forEach((cverts) => {
    const centroid = [
      cverts.reduce((s, v) => s + v.pt[0], 0) / cverts.length,
      cverts.reduce((s, v) => s + v.pt[1], 0) / cverts.length,
    ];
    cverts.forEach((v) => snappedMap.set(v.key, centroid));
  });

  return snappedMap;
}

// ─── Edge key (order-independent) ─────────────────────────────────────────

function makeEdgeKey(p1, p2) {
  const [x1, y1] = p1, [x2, y2] = p2;
  return (x1 < x2 || (x1 === x2 && y1 < y2))
    ? `${x1},${y1}|${x2},${y2}`
    : `${x2},${y2}|${x1},${y1}`;
}

// ─── Chain grouping ────────────────────────────────────────────────────────

/**
 * Groups a list of {pts} edges into chains of consecutive points.
 * A chain is rendered as one multi-point polyline, eliminating endpoint
 * caps at interior corners.
 */
function groupEdgesIntoChains(edges) {
  if (!edges.length) return [];

  // Use exact float coords as keys — centroids from the same cluster share
  // the exact same object value so equality is safe.
  function ptKey(pt) { return `${pt[0]},${pt[1]}`; }

  const adj = new Map();    // ptKey → [neighbor ptKey]
  const ptCoords = new Map(); // ptKey → coords

  edges.forEach(({ pts }) => {
    const [a, b] = pts;
    const ka = ptKey(a), kb = ptKey(b);
    if (ka === kb) return; // skip zero-length edges
    ptCoords.set(ka, a);
    ptCoords.set(kb, b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(kb);
    adj.get(kb).push(ka);
  });

  const visited = new Set();
  const chains = [];

  function ekey(ka, kb) { return ka < kb ? `${ka}||${kb}` : `${kb}||${ka}`; }

  function traceFrom(start) {
    const chain = [ptCoords.get(start)];
    let cur = start;
    while (true) {
      const next = (adj.get(cur) ?? []).find(nb => !visited.has(ekey(cur, nb)));
      if (!next) break;
      visited.add(ekey(cur, next));
      chain.push(ptCoords.get(next));
      cur = next;
    }
    return chain;
  }

  // Open ends first (degree-1 vertices are chain starts/ends)
  for (const [key, neighbors] of adj) {
    if (neighbors.length === 1 && neighbors.some(nb => !visited.has(ekey(key, nb)))) {
      const chain = traceFrom(key);
      if (chain.length >= 2) chains.push(chain);
    }
  }

  // Closed loops and any remaining segments
  for (const [key] of adj) {
    if ((adj.get(key) ?? []).some(nb => !visited.has(ekey(key, nb)))) {
      const chain = traceFrom(key);
      if (chain.length >= 2) chains.push(chain);
    }
  }

  return chains;
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * @param {Array} polygonAnnotations - annotations with type==='polygon'
 * @param {number} threshold - snap/proximity threshold in pixels
 * @returns {Map<annId, { chains: [[[x,y],...]], snappedPoints: [[x,y],...] }>}
 *   chains       — groups of consecutive border points for polyline rendering
 *   snappedPoints — polygon vertices aligned to shared borders (use for fill)
 */
export function buildNormalizedBorders(
  polygonAnnotations,
  threshold = SNAP_THRESHOLD_PX
) {
  if (!polygonAnnotations.length) return new Map();

  const polygons = polygonAnnotations.map((ann) => ({
    id: annId(ann),
    points: annPoints(ann),
  }));

  // Step 1: Snap nearby vertices to cluster centroids
  const snappedVertexMap = snapVertices(polygons, threshold);
  const snappedPolygons = polygons.map((poly) => ({
    ...poly,
    snappedPoints: poly.points.map(
      (_, idx) =>
        snappedVertexMap.get(`${polygons.indexOf(poly)},${idx}`) ?? poly.points[idx]
    ),
  }));

  // Step 2: Build canonical edge registry
  //   Fast path  — exact key match on snapped coordinates
  //   Slow path  — geometric proximity (catches colinear edges with different vertices)
  const registry = []; // { key, pts, count, claimedBy }

  snappedPolygons.forEach((poly) => {
    const n = poly.snappedPoints.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly.snappedPoints[i];
      const p2 = poly.snappedPoints[(i + 1) % n];
      const key = makeEdgeKey(p1, p2);

      const entry =
        registry.find((e) => e.key === key) ??
        registry.find((e) => edgesAreNear([p1, p2], e.pts, threshold));

      if (entry) {
        entry.count++;
      } else {
        registry.push({ key, pts: [p1, p2], count: 1, claimedBy: null });
      }
    }
  });

  // Step 3: Assign edges to polygons (first claimant wins)
  const result = new Map();

  snappedPolygons.forEach((poly) => {
    const rawEdges = [];
    const n = poly.snappedPoints.length;

    for (let i = 0; i < n; i++) {
      const p1 = poly.snappedPoints[i];
      const p2 = poly.snappedPoints[(i + 1) % n];
      const key = makeEdgeKey(p1, p2);

      const entry =
        registry.find((e) => e.key === key) ??
        registry.find((e) => edgesAreNear([p1, p2], e.pts, threshold));

      if (entry && !entry.claimedBy) {
        entry.claimedBy = poly.id;
        rawEdges.push({ pts: entry.pts, isShared: entry.count > 1 });
      }
    }

    result.set(poly.id, {
      chains: groupEdgesIntoChains(rawEdges),
      snappedPoints: poly.snappedPoints,
    });
  });

  return result;
}
