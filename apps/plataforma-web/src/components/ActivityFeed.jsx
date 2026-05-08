import React, { useMemo, useState } from 'react';
import { UserPlus, ArrowRight, Phone, UserMinus, Home, Calendar, FileText, Mail, Activity as ActivityIcon, ChevronDown } from 'lucide-react';
import './ActivityFeed.css';

const ICONS = {
  prospect_created:   { Icon: UserPlus,  color: 'var(--color-success)' },
  prospect_category:  { Icon: ArrowRight, color: '#3b82f6' },
  prospect_followup:  { Icon: Phone,     color: '#14b8a6' },
  prospect_deleted:   { Icon: UserMinus, color: 'var(--color-danger)' },
  lot_status:         { Icon: Home,      color: '#c5a059' },
  call_made:          { Icon: Phone,     color: '#14b8a6' },
  meeting_scheduled:  { Icon: Calendar,  color: '#3b82f6' },
  meeting_completed:  { Icon: Calendar,  color: '#10b981' },
  note_added:         { Icon: FileText,  color: '#8b5cf6' },
  prospect_contacted: { Icon: Phone,     color: '#14b8a6' },
  email_sent:         { Icon: Mail,      color: '#3b82f6' },
  other:              { Icon: ActivityIcon,  color: 'var(--color-text-muted)' },
};

const DESCRIPTIONS = {
  prospect_created:   (e) => `Prospecto "${e.name}" agregado`,
  prospect_category:  (e) => `Prospecto "${e.name}" movido a ${e.to}`,
  prospect_followup:  (e) => `Seguimiento con "${e.name}"`,
  prospect_deleted:   (e) => `Prospecto "${e.name}" eliminado`,
  lot_status:         (e) => `Lote "${e.name}" ${e.to}`,
  call_made:          (e) => `Llamada con "${e.name}"`,
  meeting_scheduled:  (e) => `Reunión agendada con "${e.name}"`,
  meeting_completed:  (e) => `Reunión completada con "${e.name}"`,
  note_added:         (e) => `Nota en "${e.name}"`,
  prospect_contacted: (e) => `Contacto con "${e.name}"`,
  email_sent:         (e) => `Email a "${e.name}"`,
  other:              (e) => e.description ?? `Actividad en "${e.name}"`,
};

function relativeTime(ts) {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  return `hace ${Math.floor(diffHr / 24)}d`;
}

const ITEMS_TO_SHOW = 4;

export default function ActivityFeed({ activities = [], sectionTitle = 'Actividad Reciente', sectionEyebrow, sectionSubtitle }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const enriched = useMemo(
    () =>
      activities.map(e => ({
        ...e,
        description: DESCRIPTIONS[e.type]?.(e) ?? e.type,
        iconMeta: ICONS[e.type] ?? { Icon: ArrowRight, color: 'var(--color-text-muted)' },
        relTime: relativeTime(e.ts),
      })),
    [activities]
  );

  const hasMore = enriched.length > ITEMS_TO_SHOW;
  const visibleItems = isExpanded ? enriched : enriched.slice(0, ITEMS_TO_SHOW);

  return (
    <div className="activity-feed">
      <div className="activity-feed-header has-deco-icon">
        <ActivityIcon className="section-deco-icon" size={72} />
        {sectionEyebrow && <div className="stats-header-eyebrow">{sectionEyebrow}</div>}
        <h3 className="activity-feed-title">{sectionTitle}</h3>
        {sectionSubtitle && <p className="activity-feed-subtitle">{sectionSubtitle}</p>}
      </div>
      {activities.length === 0 ? (
        <div className="activity-feed-empty">
          Sin actividad reciente
        </div>
      ) : (
        <>
          <ul className="activity-feed-list">
            {visibleItems.map((event, idx) => {
              const { Icon, color } = event.iconMeta;
              return (
                <li
                  key={`${event.type}-${event.id}-${event.ts}`}
                  className="activity-item"
                  style={{ '--item-accent': color }}
                >
                  <span className="activity-item-icon">
                    <Icon size={16} />
                  </span>
                  <span className="activity-item-body">
                    <span className="activity-item-text">{event.description}</span>
                    <span className="activity-item-time">{event.relTime}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button
              className="activity-feed-load-more"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <span>{isExpanded ? 'Ver menos' : `${enriched.length - ITEMS_TO_SHOW} más`}</span>
              <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform var(--duration-fast) var(--ease-out)' }} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
