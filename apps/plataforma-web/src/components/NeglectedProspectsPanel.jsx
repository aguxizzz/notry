import { useMemo } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { CATEGORY_DISPLAY } from '../constants';
import './NeglectedProspectsPanel.css';

const DAYS_THRESHOLDS = [
  { min: 0,  max: 7,  colorVar: '--accent-color',      label: 'Ahora',     dotClass: 'urgency-low'    },
  { min: 8,  max: 14, colorVar: '--color-warning',     label: '1–2 sem',  dotClass: 'urgency-low'    },
  { min: 15, max: 30, colorVar: '--color-cat-seguimiento', label: '2 sem–1 mes', dotClass: 'urgency-mid' },
  { min: 31, max: Infinity, colorVar: '--color-danger', label: '1+ mes',   dotClass: 'urgency-high'   },
];

function getUrgency(days) {
  return DAYS_THRESHOLDS.find(t => days >= t.min && days <= t.max) ?? DAYS_THRESHOLDS[0];
}

function formatDaysAgo(isoDate) {
  if (!isoDate) return Infinity;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDaysText(days) {
  if (days === Infinity) return 'Nunca contactado';
  if (days === 1) return 'Ultimo contacto hace: 1 día';
  return `Ultimo contacto hace: ${days} días`;
}

export default function NeglectedProspectsPanel({ prospects = [] }) {
  const staleProspects = useMemo(() => {
    return prospects
      .map(p => ({ ...p, days: formatDaysAgo(p.last_contact) }))
      .filter(p => p.days !== 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [prospects]);

  const isEmpty = staleProspects.length === 0;

  return (
    <div className="category-chart neglected-panel">
      <div className="chart-header">
        <div className="chart-heading">
          <div className="stats-header-eyebrow">Seguimiento</div>
          <h3 className="chart-title">Requieren Atención</h3>
          <p className="chart-subtitle">Contactos con más tiempo sin actividad</p>
        </div>
        {!isEmpty && <AlertCircle size={20} className="chart-total-icon" title={`${staleProspects.length} pendientes`} />}
      </div>

      {isEmpty ? (
        <div className="chart-empty neglected-empty">
          <div className="neglected-empty-icon">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="16" stroke="var(--accent-color)" strokeWidth="1.5" strokeDasharray="4 3" />
              <path d="M12 18.5l4 4 8-8" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span>Todos tus prospectos han sido contactados recientemente.</span>
        </div>
      ) : (
        <div className="chart-body neglected-list">
          {staleProspects.map((p, i) => {
            const urgency = getUrgency(p.days);
            return (
              <div
                key={p.id}
                className="neglected-row"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="neglected-row-left">
                  <span className={`urgency-dot ${urgency.dotClass}`} />
                  <div className="neglected-row-info">
                    <span className="neglected-name">{p.name}</span>
                    <span className={`badge category-${p.category} neglected-category-badge`}>
                      {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <div className="neglected-row-right">
                  <div className="neglected-days">
                    <Clock size={11} />
                    <span>{formatDaysText(p.days)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
