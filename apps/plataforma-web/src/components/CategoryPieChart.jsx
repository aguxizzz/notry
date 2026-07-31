import { useMemo } from 'react';
import { SegmentRing } from '../ui/components';
import './CategoryPieChart.css';

const CATEGORY_META = {
  primer_contacto: { label: 'Primer Contacto', colorVar: '--color-cat-contacto' },
  seguimiento:     { label: 'Seguimiento',      colorVar: '--color-cat-seguimiento' },
  negociacion:     { label: 'Negociación',       colorVar: '--color-cat-negociacion' },
  vendido:         { label: 'Vendido',           colorVar: '--color-cat-vendido' },
};

export default function CategoryPieChart({ prospects = [], embedded = false }) {
  const { segments, total } = useMemo(() => {
    const counts = {};
    prospects.forEach(p => {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const order = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];
    const segs = order
      .filter(cat => counts[cat] > 0)
      .map(cat => ({
        category: cat,
        count: counts[cat],
        ...CATEGORY_META[cat],
      }));

    return {
      segments: segs,
      total: segs.reduce((a, s) => a + s.count, 0),
    };
  }, [prospects]);

  const isEmpty = segments.length === 0;

  return (
    <div className={`category-chart${embedded ? ' category-chart--embedded' : ''}`}>
      <span className="cpc-label">Composición por categoría</span>

      {isEmpty ? (
        <div className="chart-empty">
          <span>Sin datos de prospectos</span>
        </div>
      ) : (
        <div className="cpc-wrap">
          <SegmentRing segments={segments.map(s => ({ color: `var(${s.colorVar})`, n: s.count }))}>
            <b>{total}</b>
            <span>{total === 1 ? 'contacto' : 'contactos'}</span>
          </SegmentRing>
          <div className="cpc-legend">
            {segments.map(seg => (
              <span key={seg.category} className="cpc-lk" style={{ '--c': `var(${seg.colorVar})` }}>
                <span className="cpc-lk-d" />
                {seg.label}
                <b>{seg.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
