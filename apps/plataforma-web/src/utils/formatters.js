export const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Entero con separador de miles (es-AR). null/undefined → "0". */
export const formatNumber = (n) => Math.round(n ?? 0).toLocaleString('es-AR');

/** Porcentaje con hasta un decimal: 6,8% / 100%. */
export const formatPercent = (value) => `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

/** Segundos → "45s" / "2m 19s". null si no hay valor (cada vista decide qué mostrar). */
export const formatDuration = (seconds) => {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
};
