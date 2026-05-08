import { useMemo } from 'react';
import './CategoryPieChart.css';

const CATEGORY_META = {
  primer_contacto: { label: 'Primer Contacto', colorVar: '--color-cat-contacto' },
  seguimiento:     { label: 'Seguimiento',      colorVar: '--color-cat-seguimiento' },
  negociacion:     { label: 'Negociación',       colorVar: '--color-cat-negociacion' },
  vendido:         { label: 'Vendido',           colorVar: '--color-cat-vendido' },
};

export default function CategoryPieChart({ prospects = [] }) {
  const { segments, total, topSegment } = useMemo(() => {
    const counts = {};
    prospects.forEach(p => {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const total = prospects.length;
    if (total === 0) return { segments: [], total: 0, topSegment: null };

    const order = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];
    const segs = order
      .filter(cat => counts[cat] > 0)
      .map(cat => ({
        category: cat,
        count: counts[cat],
        pct: Math.round((counts[cat] / total) * 100),
        ...CATEGORY_META[cat],
      }));

    return {
      segments: segs,
      total,
      topSegment: [...segs].sort((a, b) => b.count - a.count)[0] ?? null,
    };
  }, [prospects]);

  const isEmpty = total === 0;

  return (
    <div className="category-chart">
      <div className="chart-header">
        <div className="chart-heading">
          <div className="stats-header-eyebrow">Pipeline</div>
          <h3 className="chart-title">Prospectos por Etapa</h3>
          <p className="chart-subtitle">Distribución actual de prospectos</p>
        </div>
        <span className="chart-total">{total} total</span>
      </div>

      {isEmpty ? (
        <div className="chart-empty">
          <span>Sin datos de prospectos</span>
        </div>
      ) : (
        <div className="chart-body">
          <div className="chart-summary">
            <div>
              <span className="chart-summary-label">Etapa principal</span>
              <strong>{topSegment.label}</strong>
            </div>
            <span>{topSegment.pct}%</span>
          </div>
          {segments.map((seg) => (
            <div key={seg.category} className="chart-row">
              <div className="chart-row-header">
                <span className="chart-row-label">{seg.label}</span>
                <div className="chart-row-meta">
                  <span className="chart-row-count">{seg.count}</span>
                  <span className="chart-row-pct">{seg.pct}%</span>
                </div>
              </div>
              <div className="chart-bar-track">
                <div
                  className="chart-bar-fill"
                  style={{
                    width: `${seg.pct}%`,
                    background: `var(${seg.colorVar})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
