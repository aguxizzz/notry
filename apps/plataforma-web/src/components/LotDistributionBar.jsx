import React, { useState } from 'react';
import './LotDistributionBar.css';

const LotDistributionBar = ({ summary, loading = false }) => {
  const [activeSegment, setActiveSegment] = useState(null);

  if (loading || !summary) {
    return (
      <div className="lot-distribution-bar">
        <div className="distribution-bar-container">
          <div className="distribution-bar-skeleton" />
        </div>
      </div>
    );
  }

  const total =
    summary.lotes_disponibles +
    summary.lotes_reservados +
    summary.lotes_vendidos;

  if (total === 0) {
    return (
      <div className="lot-distribution-bar">
        <div className="distribution-empty">
          No hay lotes registrados
        </div>
      </div>
    );
  }

  const available = summary.lotes_disponibles;
  const reserved = summary.lotes_reservados;
  const sold = summary.lotes_vendidos;
  const occupied = reserved + sold;

  const availablePercent = (available / total) * 100;
  const reservedPercent = (reserved / total) * 100;
  const soldPercent = (sold / total) * 100;
  const occupiedPercent = (occupied / total) * 100;

  const segments = [
    {
      id: 'available',
      label: 'Disponibles',
      count: available,
      percent: availablePercent,
      color: 'var(--color-stat-available)',
    },
    {
      id: 'reserved',
      label: 'Reservados',
      count: reserved,
      percent: reservedPercent,
      color: 'var(--color-stat-reserved)',
    },
    {
      id: 'sold',
      label: 'Vendidos',
      count: sold,
      percent: soldPercent,
      color: 'var(--color-stat-sold)',
    },
  ];

  return (
    <div className="lot-distribution-bar">
      <div className="distribution-header">
        <h3 className="distribution-title">Distribución de Lotes</h3>
        <div className="distribution-occupied">
          <span className="occupied-percent">{occupiedPercent.toFixed(0)}%</span>
          <span className="occupied-label">Ocupado</span>
        </div>
      </div>

      <div className="distribution-bar-container">
        <div className="distribution-bar">
          {segments.map(seg => (
            <div
              key={seg.id}
              className={`segment ${activeSegment === seg.id ? 'active' : ''}`}
              style={{
                width: `${seg.percent}%`,
                backgroundColor: seg.color,
              }}
              onMouseEnter={() => setActiveSegment(seg.id)}
              onMouseLeave={() => setActiveSegment(null)}
              role="progressbar"
              aria-valuenow={seg.count}
              aria-valuemin="0"
              aria-valuemax={total}
              aria-label={`${seg.label}: ${seg.count} lotes (${seg.percent.toFixed(1)}%)`}
              title={`${seg.label}: ${seg.count} lotes (${seg.percent.toFixed(1)}%)`}
            >
              {seg.percent > 15 && (
                <span className="segment-label">{seg.percent.toFixed(0)}%</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-stats">
        {segments.map(seg => (
          <div key={seg.id} className="stat-detail">
            <span className="stat-detail-dot" style={{ backgroundColor: seg.color }} />
            <span className="stat-detail-label">{seg.label}</span>
            <span className="stat-detail-value">{seg.count}</span>
          </div>
        ))}
        <div className="stat-total">
          <span className="stat-total-label">Total:</span>
          <span className="stat-total-value">{total}</span>
        </div>
      </div>
    </div>
  );
};

export default LotDistributionBar;
