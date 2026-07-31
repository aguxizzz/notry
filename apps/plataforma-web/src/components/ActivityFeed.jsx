import React, { useMemo } from 'react';
import { SectionHeader } from '../ui/components';
import { getActivityMeta } from '../constants/activityTypes';
import './ActivityFeed.css';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Etiqueta del grupo temporal: Hoy / Ayer / fecha (con año si es de otro año).
function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('es', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Hora exacta (complementa al grupo por día; no repite el "hace X").
function clockTime(ts) {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityFeed({ activities = [], sectionTitle = 'Actividad Reciente', sectionEyebrow = 'Registro', sectionSubtitle }) {
  const enriched = useMemo(
    () =>
      activities.map(e => {
        const meta = getActivityMeta(e.type);
        return {
          ...e,
          description: meta.description(e),
          iconMeta: meta,
          clock: clockTime(e.ts),
        };
      }),
    [activities]
  );

  // Agrupar por día preservando el orden (más reciente primero).
  const groups = useMemo(() => {
    const out = [];
    let current = null;
    for (const e of enriched) {
      const label = dayLabel(e.ts);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        out.push(current);
      }
      current.items.push(e);
    }
    return out;
  }, [enriched]);

  return (
    <div className="activity-feed">
      <SectionHeader
        tier="aside"
        className="activity-feed-header"
        eyebrow={sectionEyebrow}
        title={sectionTitle}
        sub={sectionSubtitle}
      />
      {activities.length === 0 ? (
        <div className="activity-feed-empty">
          Sin actividad reciente
        </div>
      ) : (
        <div className="activity-feed-scroll">
          <ul className="activity-feed-list">
            {groups.map((group) => (
              <React.Fragment key={group.label}>
                <li className="activity-day-head">{group.label}</li>
                {group.items.map((event) => {
                  const { Icon, color } = event.iconMeta;
                  return (
                    <li
                      key={`${event.type}-${event.id}-${event.ts}`}
                      className={`activity-item ${event.isOptimistic ? 'activity-item-new' : ''}`}
                      style={{ '--item-accent': color }}
                    >
                      <span className="activity-item-icon">
                        <Icon size={16} />
                      </span>
                      <span className="activity-item-body">
                        <span className="activity-item-text">{event.description}</span>
                        <span className="activity-item-time">{event.clock}</span>
                      </span>
                    </li>
                  );
                })}
              </React.Fragment>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
