// Helpers puros + cálculo de métricas del inventario.
// Sin React, sin efectos secundarios, sin estado. Movidos desde InventarioView.jsx
// en la Fase 1 del refactor para adelgazar la vista.

import { getInventoryAttentionCounts } from './inventoryAttention';

// ── Formatters ────────────────────────────────────────────────────────────────

export function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(n) {
  const v = Math.round(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v.toLocaleString('es-AR')}`;
}

export function fmtInt(n) {
  return Math.round(n).toLocaleString('es-AR');
}

// ── Stats ─────────────────────────────────────────────────────────────────────

// Calcula todas las métricas derivadas de la vista a partir de los datos que el
// front ya tiene (lotes + loteos + dashboardSummary). Cero backend.
export function computeInventoryStats(lots = [], loteos = [], summary = null, attentionContext = {}) {
  let available = 0, reserved = 0, sold = 0, unavailable = 0;
  let sumArea = 0, sumPrice = 0, priceCount = 0;
  let minPrice = Infinity, maxPrice = -Infinity;
  let sumPricePerM2 = 0, ppm2Count = 0;
  const byLoteo = new Map();

  for (const lot of lots) {
    const price = toNum(lot.price);
    const area = toNum(lot.area_m2);
    if (lot.status === 'available') available++;
    else if (lot.status === 'reserved') reserved++;
    else if (lot.status === 'sold') sold++;
    else if (lot.status === 'unavailable') unavailable++;

    sumArea += area;
    if (price > 0) {
      sumPrice += price; priceCount++;
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);
      if (area > 0) { sumPricePerM2 += price / area; ppm2Count++; }
    }

    const key = lot.loteo_id ?? lot.loteo_name ?? '—';
    if (!byLoteo.has(key)) {
      byLoteo.set(key, { name: lot.loteo_name ?? 'Sin loteo', total: 0, available: 0, reserved: 0, sold: 0, unavailable: 0, sumPrice: 0, priceCount: 0 });
    }
    const g = byLoteo.get(key);
    g.total++;
    if (lot.status === 'available') g.available++;
    else if (lot.status === 'reserved') g.reserved++;
    else if (lot.status === 'sold') g.sold++;
    else if (lot.status === 'unavailable') g.unavailable++;
    if (price > 0) { g.sumPrice += price; g.priceCount++; }
  }

  const cAvailable = summary?.lotes_disponibles ?? available;
  const cReserved = summary?.lotes_reservados ?? reserved;
  const cSold = summary?.lotes_vendidos ?? sold;
  const cUnavailable = summary?.lotes_no_disponibles ?? unavailable;
  const cTotal = summary?.total_lotes ?? (available + reserved + sold + unavailable);
  const pct = (n) => (cTotal > 0 ? Math.round((n / cTotal) * 100) : 0);

  const distribution = [...byLoteo.values()]
    .map(g => ({
      name: g.name,
      total: g.total,
      available: g.available,
      reserved: g.reserved,
      sold: g.sold,
      unavailable: g.unavailable,
      availablePct: g.total > 0 ? Math.round((g.available / g.total) * 100) : 0,
      avgPrice: g.priceCount > 0 ? g.sumPrice / g.priceCount : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: cTotal,
    available: cAvailable, reserved: cReserved, sold: cSold, unavailable: cUnavailable,
    availablePct: pct(cAvailable),
    sumArea,
    ticket: priceCount > 0 ? sumPrice / priceCount : 0,
    valorEstimado: summary ? toNum(summary.valor_inventario) : sumPrice,
    pricePerM2: ppm2Count > 0 ? sumPricePerM2 / ppm2Count : 0,
    minPrice: minPrice === Infinity ? 0 : minPrice,
    maxPrice: maxPrice === -Infinity ? 0 : maxPrice,
    distribution,
    attention: getInventoryAttentionCounts(lots, loteos, attentionContext),
  };
}

// ── Ring "Lotes por estado" ───────────────────────────────────────────────────

// Ring "Lotes por estado". No es 1:1 con los datos: cada estado presente lleva
// un piso visual mínimo (para que Reservado/Vendido no desaparezcan) y el resto
// se reparte proporcional; hay un hueco entre segmentos. Los números reales van
// en la leyenda y el % de disponibilidad al centro.
export const RING_STATES = [
  { key: 'available', color: 'var(--badge-available)', label: 'Disponibles' },
  { key: 'reserved', color: 'var(--color-stat-reserved)', label: 'Reservados' },
  { key: 'sold', color: 'var(--badge-sold)', label: 'Vendidos' },
  { key: 'unavailable', color: 'var(--badge-unavailable)', label: 'No disponibles' },
];

export function buildRingGradient(counts) {
  const present = RING_STATES
    .map(s => ({ ...s, n: counts[s.key] ?? 0 }))
    .filter(s => s.n > 0);
  const totalN = present.reduce((a, s) => a + s.n, 0);
  if (totalN === 0) return 'var(--inv-track) 0 100%';

  const GAP = present.length > 1 ? 1.6 : 0; // hueco entre segmentos (%)
  const FLOOR = 9;           // piso visual por segmento (%)
  const gapTotal = present.length * GAP;
  const usable = 100 - gapTotal;
  const floorTotal = Math.min(present.length * FLOOR, usable * 0.6);
  const floor = floorTotal / present.length;
  const remainder = usable - floorTotal;

  const stops = [];
  let cursor = 0;
  present.forEach((s, i) => {
    const size = floor + (s.n / totalN) * remainder;
    const end = cursor + size;
    stops.push(`${s.color} ${cursor}% ${end}%`);
    // hueco después de cada segmento (transparente)
    const gapEnd = i === present.length - 1 ? 100 : end + GAP;
    stops.push(`transparent ${end}% ${gapEnd}%`);
    cursor = gapEnd;
  });
  return stops.join(', ');
}

// ── Loteos agrupados por proyecto ────────────────────────────────────────────

// Los loteos que comparten project_id son las etapas de un mismo stage switcher
// en el visor. Ordena los sueltos y agrupados bajo el nombre del proyecto, y
// devuelve filas con metadata de posición para el recuadro visual del grupo.
export function buildLoteoRows(data, projects = []) {
  const projectById = new Map((projects || []).map(p => [String(p.id), p]));
  const groupsByProject = new Map();
  const order = [];
  for (const loteo of data) {
    if (!loteo.project_id) {
      order.push({ kind: 'standalone', loteo });
    } else {
      if (!groupsByProject.has(loteo.project_id)) {
        const entry = { kind: 'group', projectId: loteo.project_id, members: [] };
        groupsByProject.set(loteo.project_id, entry);
        order.push(entry);
      }
      groupsByProject.get(loteo.project_id).members.push(loteo);
    }
  }
  const rows = [];
  for (const item of order) {
    if (item.kind === 'standalone') {
      rows.push({ key: item.loteo.id, loteo: item.loteo, variant: 'standalone' });
      continue;
    }
    // Un solo loteo en el proyecto: no hay switcher, no vale la pena mostrar
    // el recuadro de grupo por una fila sola.
    if (item.members.length === 1) {
      rows.push({ key: item.members[0].id, loteo: item.members[0], variant: 'standalone' });
      continue;
    }
    item.members.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.name.localeCompare(b.name));
    const groupLabel = projectById.get(String(item.projectId))?.name ?? item.members[0]?.name ?? 'Proyecto';
    rows.push({
      key: `header-${item.projectId}`,
      variant: 'group-header',
      label: groupLabel,
      isFirst: true,
      isLast: false,
    });
    item.members.forEach((loteo, i) => {
      rows.push({
        key: loteo.id,
        loteo,
        variant: 'group',
        isFirst: false,
        isLast: i === item.members.length - 1,
      });
    });
  }
  return rows;
}

// ── "Hace Xh" relativo ────────────────────────────────────────────────────────

export function formatRelativeContact(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}
