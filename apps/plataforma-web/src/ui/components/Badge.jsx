import React from 'react';
import './Badge.css';

const STATUS_STYLES = {
  available: { bgVar: '--badge-available-bg', colorVar: '--badge-available', label: 'disponible' },
  reserved:  { bgVar: '--badge-reserved-bg', colorVar: '--badge-reserved', label: 'reservado' },
  sold:      { bgVar: '--badge-sold-bg', colorVar: '--badge-sold', label: 'vendido' },
  unavailable: { bgVar: '--badge-unavailable-bg', colorVar: '--badge-unavailable', label: 'no disponible' },
};

const CATEGORY_STYLES = {
  primer_contacto: { bgVar: '--color-cat-contacto-bg', colorVar: '--color-cat-contacto', label: 'Primer Contacto' },
  seguimiento:     { bgVar: '--color-cat-seguimiento-bg', colorVar: '--color-cat-seguimiento', label: 'Seguimiento' },
  negociacion:     { bgVar: '--color-cat-negociacion-bg', colorVar: '--color-cat-negociacion', label: 'Negociación' },
  vendido:         { bgVar: '--color-cat-vendido-bg', colorVar: '--color-cat-vendido', label: 'Vendido' },
};

export default function Badge({ variant = 'status', value, children, className = '' }) {
  const style = variant === 'category' && value
    ? CATEGORY_STYLES[value] || CATEGORY_STYLES[value.replace(/_/g, '')]
    : STATUS_STYLES[value] || STATUS_STYLES[value?.replace(/_/g, '')];

  if (!style && !children) return null;

  return (
    <span
      className={`badge ${className}`}
      style={style ? { background: `var(${style.bgVar})`, color: `var(${style.colorVar})` } : undefined}
    >
      {children || style?.label || value}
    </span>
  );
}
