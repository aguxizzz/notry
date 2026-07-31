import { useMemo } from 'react';
import { Panel, SectionHeader } from '../ui/components';
import { CATEGORY_DISPLAY, ORIGIN_DISPLAY } from '../constants';
import { daysSinceContact, NEGLECTED_THRESHOLD_DAYS } from '../utils/prospects';
import './NeglectedProspectsPanel.css';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Hero de "seguimiento vencido": contactos sin actualizar hace más de
// NEGLECTED_THRESHOLD_DAYS días. El conteo total (para la banda de stats de
// ClientesView) se computa con el mismo umbral vía daysSinceContact, así los
// números nunca divergen entre este panel y la banda.
export default function NeglectedProspectsPanel({ prospects = [], onUpdateContact }) {
  const stale = useMemo(() => {
    return prospects
      .map(p => ({ ...p, days: daysSinceContact(p.last_contact) }))
      .filter(p => p.days != null && p.days >= NEGLECTED_THRESHOLD_DAYS)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [prospects]);

  if (stale.length === 0) return null;

  return (
    <Panel as="section" className="cli-hero">
      <SectionHeader
        className="cli-hero-head"
        eyebrow="Requiere acción"
        title="Seguimiento vencido"
        sub={`Contactos sin actualizar hace más de ${NEGLECTED_THRESHOLD_DAYS} días`}
        actions={<span className="cli-hero-count">{stale.length}</span>}
      />
      <div className="cli-hero-list">
        {stale.map((p, i) => (
          <div className="cli-hero-item" key={p.id} style={{ animationDelay: `${i * 60}ms` }}>
            <span className="cli-hero-avatar">{initials(p.name)}</span>
            <div className="cli-hero-info">
              <span className="cli-hero-name">{p.name}</span>
              <span className="cli-hero-meta">
                {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')} · {ORIGIN_DISPLAY[p.origin] ?? 'Origen desconocido'}
              </span>
            </div>
            <span className={`cli-hero-days ${p.days >= NEGLECTED_THRESHOLD_DAYS * 2 ? 'cli-hero-days--critical' : p.days >= NEGLECTED_THRESHOLD_DAYS + 15 ? 'cli-hero-days--high' : ''}`}>
              {p.days} días
            </span>
            {onUpdateContact && (
              <button type="button" className="cli-hero-btn" onClick={() => onUpdateContact(p.id, p.name)}>
                Actualizar
              </button>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
