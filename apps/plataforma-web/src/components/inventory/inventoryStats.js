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
  const soldByMonth = new Map();

  for (const lot of lots) {
    const price = toNum(lot.price);
    const area = toNum(lot.area_m2);
    if (lot.status === 'available') available++;
    else if (lot.status === 'reserved') reserved++;
    else if (lot.status === 'sold') sold++;
    else if (lot.status === 'unavailable') unavailable++;

    if (lot.sold_at) {
      const soldDate = new Date(lot.sold_at);
      if (!Number.isNaN(soldDate.getTime())) {
        const monthKey = `${soldDate.getFullYear()}-${String(soldDate.getMonth() + 1).padStart(2, '0')}`;
        soldByMonth.set(monthKey, (soldByMonth.get(monthKey) ?? 0) + 1);
      }
    }

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

  const MONTHS_BACK = 6;
  const now = new Date();
  const monthlySales = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlySales.push({
      key: monthKey,
      label: d.toLocaleDateString('es-AR', { month: 'short' }),
      count: soldByMonth.get(monthKey) ?? 0,
    });
  }

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
    monthlySales,
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
// en el visor. Devuelve las filas de la tabla en dos bloques: primero cada
// proyecto (encabezado + sus etapas, aunque tenga una sola) y debajo los
// loteos sin proyecto. El encabezado "Sin proyecto" solo aparece si hay algún
// proyecto arriba; si no hay ninguno, la tabla queda como una lista plana.
export function buildLoteoRows(data, projects = []) {
  const projectById = new Map((projects || []).map(p => [String(p.id), p]));
  const membersByProject = new Map();
  const loose = [];
  for (const loteo of data) {
    if (!loteo.project_id) {
      loose.push(loteo);
      continue;
    }
    if (!membersByProject.has(loteo.project_id)) membersByProject.set(loteo.project_id, []);
    membersByProject.get(loteo.project_id).push(loteo);
  }

  const rows = [];
  const pushGap = (key) => rows.push({ key, variant: 'section-gap' });
  for (const [projectId, members] of membersByProject) {
    if (rows.length > 0) pushGap(`gap-${projectId}`);
    members.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.name.localeCompare(b.name));
    rows.push({
      key: `header-${projectId}`,
      variant: 'section-header',
      kind: 'project',
      label: projectById.get(String(projectId))?.name ?? members[0]?.name ?? 'Proyecto',
      count: members.length,
    });
    for (const loteo of members) rows.push({ key: loteo.id, loteo, variant: 'group' });
  }

  if (loose.length > 0) {
    if (rows.length > 0) {
      pushGap('gap-loose');
      rows.push({ key: 'header-loose', variant: 'section-header', kind: 'loose', label: 'Sin proyecto', count: loose.length });
    }
    for (const loteo of loose) rows.push({ key: loteo.id, loteo, variant: 'standalone' });
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
