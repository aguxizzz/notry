export const DEFAULT_ALIGNMENT = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5 };

export function alignmentOf(floor) {
  return { ...DEFAULT_ALIGNMENT, ...(floor?.alignment || {}) };
}

export function alignmentTransform(a) {
  return `translate(${a.x} ${a.y}) rotate(${a.rotation}) scale(${a.scale})`;
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

// Letra siguiente libre para el código de unidad (A, B, C…) dentro de un piso.
export function nextUnitCode(floor) {
  const used = new Set((floor.units || []).map((u) => u.code));
  for (let i = 0; i < 26; i++) {
    const candidate = `${floor.code}${String.fromCharCode(65 + i)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${floor.code}${used.size + 1}`;
}

export const STATUSES = {
  available: { label: 'Disponible', color: '#22c55e' },
  reserved: { label: 'Reservado', color: '#3b82f6' },
  sold: { label: 'Vendido', color: '#ef4444' },
  unavailable: { label: 'No disponible', color: '#9ca3af' },
};
