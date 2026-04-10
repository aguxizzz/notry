import { useMemo } from 'react';

const BUDGET_COLORS = [
  '#4338ca', '#1d4ed8', '#047857', '#b45309',
  '#6d28d9', '#be123c', '#0f766e', '#c2410c',
];

function formatBudget(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export default function BudgetPieChart({ prospects = [] }) {
  const { segments, total } = useMemo(() => {
    const withBudget = prospects.filter(p => p.budget && p.budget > 0);
    const total = withBudget.reduce((sum, p) => sum + parseFloat(p.budget), 0);

    if (total === 0) return { segments: [], total: 0 };

    const segs = withBudget
      .map(p => ({
        id: p.id,
        name: p.name,
        budget: parseFloat(p.budget),
        pct: Math.round((parseFloat(p.budget) / total) * 100),
      }))
      .sort((a, b) => b.budget - a.budget);

    return { segments: segs, total };
  }, [prospects]);

  const isEmpty = segments.length === 0;

  // Only show top segments; group rest as "Others"
  const MIN_PCT = 3;
  const visibleSegments = [];
  let othersBudget = 0;
  let othersCount = 0;

  if (!isEmpty) {
    for (const seg of segments) {
      if (seg.pct < MIN_PCT && visibleSegments.length > 5) {
        othersBudget += seg.budget;
        othersCount++;
      } else {
        visibleSegments.push(seg);
      }
    }

    if (othersBudget > 0) {
      const othersPct = Math.round((othersBudget / total) * 100);
      visibleSegments.push({
        id: '__others__',
        name: `Otros (${othersCount})`,
        budget: othersBudget,
        pct: othersPct,
        colorIdx: -1,
      });
    }
  }

  return (
    <div className="category-chart">
      <div className="chart-header">
        <span className="chart-title">Presupuesto por Cliente</span>
        <span className="chart-total">{isEmpty ? '—' : formatBudget(total)} total</span>
      </div>

      {isEmpty ? (
        <div className="chart-empty">
          <span>Sin datos de presupuesto</span>
        </div>
      ) : (
        <div className="chart-body">
          {visibleSegments.map((seg, i) => (
            <div key={seg.id} className="chart-row">
              <div className="chart-row-header">
                <span className="chart-row-label">{seg.name}</span>
                <div className="chart-row-meta">
                  <span className="chart-row-count">{formatBudget(seg.budget)}</span>
                  <span className="chart-row-pct">{seg.pct}%</span>
                </div>
              </div>
              <div className="chart-bar-track">
                <div
                  className="chart-bar-fill"
                  style={{
                    width: `${seg.pct}%`,
                    background: seg.colorIdx === -1 ? 'var(--color-text-muted)' : BUDGET_COLORS[i % BUDGET_COLORS.length],
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