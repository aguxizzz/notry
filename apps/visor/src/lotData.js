// Lectura de anotaciones (lotes y POIs) tal como llegan del back. Los nombres
// de campo cambiaron con el tiempo (uuid/id, status/estado, coordenadas en
// tres formatos): todo el visor los lee desde acá.

export const annId = (ann) => ann.uuid ?? ann.id;

// Estado tal como viene (puede faltar o ser uno desconocido).
export const annStatus = (ann) => ann.status ?? ann.estado;

export const annPoints = (ann) => ann.panorama_coordinates ?? ann.polygonPixels ?? ann.polygon ?? [];

export const STATUSES = ['available', 'reserved', 'sold', 'unavailable'];

// Estado normalizado para la interfaz: lo desconocido cuenta como no disponible.
export const lotStatus = (ann) => {
  const status = annStatus(ann);
  return STATUSES.includes(status) ? status : 'unavailable';
};

// Color de cada estado: anillo del badge, relleno al pasar el mouse en la
// órbita. El panel lo repite en LotPanel.css (--lp-s-*).
export const STATUS_COLORS = {
  available: '#22c55e',
  unavailable: '#6b7280',
  sold: '#ef4444',
  reserved: '#3b82f6',
};

// Relleno suave por estado del estilo "status_fill" (el modo histórico de
// mostrar los lotes: verde/gris/rojo/azul translúcido, sin badge). Se usa igual
// en panorama y en plano.
export const STATUS_FILL_COLORS = {
  available:   'rgba(34,197,94,0.16)',
  unavailable: 'rgba(107,114,128,0.28)',
  sold:        'rgba(239,68,68,0.18)',
  reserved:    'rgba(59,130,246,0.24)',
};
export const STATUS_FILL_FALLBACK = 'rgba(0,100,255,0.08)';

export const lotArea = (ann) => {
  const n = parseFloat(ann.area_m2);
  return Number.isFinite(n) ? n : null;
};
export const fmtArea = (n) => `${Number.isInteger(n) ? n : Math.round(n * 10) / 10} m²`;
// Campos que el back todavía no manda: se muestran apenas existan.
export const lotManzana = (ann) => ann.manzana ?? ann.block ?? null;
export const lotMedidas = (ann) => (ann.frente && ann.fondo ? `${ann.frente} × ${ann.fondo} m` : null);

const roundTo = (n, step) => Math.max(step, Math.round(n / step) * step);

// Rangos de superficie por tercios de lo que hay en el loteo (no fijos: un
// loteo de quintas y uno urbano no comparten cortes).
export function sizeBuckets(lots) {
  const areas = lots.map(lotArea).filter((n) => n != null).sort((a, b) => a - b);
  if (areas.length < 6) return null;
  const step = areas[areas.length - 1] > 2000 ? 100 : 10;
  const q1 = roundTo(areas[Math.floor(areas.length / 3)], step);
  const q2 = roundTo(areas[Math.floor((areas.length * 2) / 3)], step);
  if (q2 <= q1) return null;
  return [
    { id: 's', label: `Hasta ${q1} m²`, test: (a) => a <= q1 },
    { id: 'm', label: `${q1}–${q2} m²`, test: (a) => a > q1 && a <= q2 },
    { id: 'l', label: `Más de ${q2} m²`, test: (a) => a > q2 },
  ];
}

/**
 * Lotes que pasan los filtros de la lista. Una búsqueda con números compara
 * el comienzo del número del lote (label o nombre); con letras busca en el
 * nombre y la manzana.
 */
export function filterLots(lots, { labels, onlyAvailable = false, bucket = null, query = '' }) {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/[^0-9]/g, '');
  return lots.filter((l) => {
    if (onlyAvailable && lotStatus(l) !== 'available') return false;
    if (bucket) {
      const a = lotArea(l);
      if (a == null || !bucket.test(a)) return false;
    }
    if (!q) return true;
    if (digits) {
      const own = [labels.get(annId(l)), l.tooltip].map((s) => String(s ?? '').replace(/[^0-9]/g, ''));
      return own.some((n) => n && n.startsWith(digits));
    }
    return `${l.tooltip ?? ''} manzana ${lotManzana(l) ?? ''}`.toLowerCase().includes(q);
  });
}
