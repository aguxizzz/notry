export const DEFAULT_ALIGNMENT = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5 };

export function alignmentOf(floor) {
  return { ...DEFAULT_ALIGNMENT, ...(floor?.alignment || {}) };
}

// Rotación y escala alrededor del centro de la imagen del piso (w × h); x/y desplazan en
// coordenadas de mundo. El visor tiene que aplicar exactamente esta misma transformación.
export function alignmentTransform(a, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  return `translate(${a.x + cx} ${a.y + cy}) rotate(${a.rotation}) scale(${a.scale}) translate(${-cx} ${-cy})`;
}

export function centroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    const n = points.length;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export const pointsAttr = (points) => points.map((p) => p.join(',')).join(' ');

export const round = (n) => Math.round(n * 10) / 10;
