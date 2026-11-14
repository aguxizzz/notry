// Plano geometry for the MCP tools: polygons are [[x, y], ...] normalized to [0, 1] of the
// plano image. Areas here are in those units, so they only compare lots of the same plano.

/** Shoelace area, always positive whatever the vertex order. */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Vertex average. Good enough for lots, which are convex or close to it. */
export function centroid(points) {
  const n = points.length;
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ];
}

export function bbox(points) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function median(values) {
  const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Rounds for tool output: 4 decimals is ~0.1 px on a 1000 px plano, plenty to read positions. */
export const round = (value, digits = 4) => (value == null ? null : Number(value.toFixed(digits)));
