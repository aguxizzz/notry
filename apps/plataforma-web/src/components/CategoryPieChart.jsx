import { useMemo } from 'react';

const CATEGORY_META = {
  primer_contacto: { label: 'Primer Contacto', colorVar: '--color-cat-contacto' },
  seguimiento:     { label: 'Seguimiento',      colorVar: '--color-cat-seguimiento' },
  negociacion:     { label: 'Negociación',       colorVar: '--color-cat-negociacion' },
  vendido:         { label: 'Vendido',           colorVar: '--color-cat-vendido' },
};

export default function CategoryPieChart({ prospects = [] }) {
  const { segments, total } = useMemo(() => {
    const counts = {};
    prospects.forEach(p => {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const total = prospects.length;
    if (total === 0) return { segments: [], total: 0 };

    const order = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];
    const segs = order
      .filter(cat => counts[cat] > 0)
      .map(cat => ({
        category: cat,
        count: counts[cat],
        pct: Math.round((counts[cat] / total) * 100),
        ...CATEGORY_META[cat],
      }));

    return { segments: segs, total };
  }, [prospects]);

  const isEmpty = total === 0;

  return (
    <div className="category-chart">
      <div className="chart-header">
        <span className="chart-title">Prospectos por Etapa</span>
        <span className="chart-total">{total} total</span>
      </div>

      {isEmpty ? (
        <div className="chart-empty">
          <span>Sin datos de prospectos</span>
        </div>
      ) : (
        <div className="chart-body">
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