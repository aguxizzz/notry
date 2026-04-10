import React from 'react';

const STATUS_STYLES = {
  available: { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', label: 'disponible' },
  reserved:  { bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309', label: 'reservado' },
  sold:      { bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', label: 'vendido' },
};

const CATEGORY_STYLES = {
  primer_contacto: { bg: 'rgba(99, 102, 241, 0.12)', color: '#4338ca', label: 'Primer Contacto' },
  seguimiento:     { bg: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8', label: 'Seguimiento' },
  negociacion:     { bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309', label: 'Negociación' },
  vendido:         { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', label: 'Vendido' },
};

export default function Badge({ variant = 'status', value, children }) {
  const style = variant === 'category' && value
    ? CATEGORY_STYLES[value] || CATEGORY_STYLES[value.replace(/_/g, '')]
    : STATUS_STYLES[value] || STATUS_STYLES[value?.replace(/_/g, '')];

  if (!style && !children) return null;

  return (
    <span
      className="badge"
      style={style ? { background: style.bg, color: style.color } : undefined}
    >
      {children || style?.label || value}
    </span>
  );
}
