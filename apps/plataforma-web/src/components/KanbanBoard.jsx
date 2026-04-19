import { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config';
import { Loader } from '../ui/components';

const CATEGORIES = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];

const COL_META = {
  primer_contacto: { label: 'Primer Contacto', accentVar: '--kanban-contacto-accent' },
  seguimiento:     { label: 'Seguimiento',      accentVar: '--kanban-seguimiento-accent' },
  negociacion:     { label: 'Negociación',       accentVar: '--kanban-negociacion-accent' },
  vendido:         { label: 'Vendido',           accentVar: '--kanban-vendido-accent' },
};

function formatRelativeContact(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AdvisorAvatar({ name, size = 28 }) {
  const initials = getInitials(name);
  return (
    <div
      className="kanban-avatar"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={name || 'Sin asesor'}
    >
      {initials}
    </div>
  );
}

export default function KanbanBoard({ token, onSessionExpired, prospectosList = [], loteos = [], advisorsList = [] }) {
  const [columns, setColumns] = useState({
    primer_contacto: [],
    seguimiento: [],
    negociacion: [],
    vendido: [],
  });
  const [loading, setLoading] = useState(true);
  const [patchingIds, setPatchingIds] = useState(new Set());
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [kanbanError, setKanbanError] = useState(null);

  // Enrich prospect data with loteo/lote names and advisor name
  const enrichedProspects = useMemo(() => {
    const loteoMap = {};
    loteos.forEach(l => { loteoMap[l.id] = l.name; });
    const loteMap = {};
    // Build loteuuid -> { name, loteo_name } map from all loteos
    loteos.forEach(loteo => {
      (loteo.lotes || []).forEach(lot => {
        loteMap[lot.id] = {
          name: lot.name,
          loteo_name: loteo.name,
        };
      });
    });
    const advisorMap = {};
    advisorsList.forEach(a => { advisorMap[a.id] = a.full_name || a.name || ''; });
    return prospectosList.map(p => {
      const loteInfo = loteMap[p.lote_id] || {};
      const advisorName = advisorMap[p.advisor_id] || null;
      return {
        ...p,
        loteo_name: loteInfo.loteo_name || null,
        lote_name: loteInfo.name || null,
        advisorName,
      };
    });
  }, [prospectosList, loteos, advisorsList]);

  // Group enriched prospectosList into columns on change
  useEffect(() => {
    if (enrichedProspects.length === 0) return;
    const grouped = { primer_contacto: [], seguimiento: [], negociacion: [], vendido: [] };
    enrichedProspects.forEach(p => {
      if (grouped[p.category] !== undefined) grouped[p.category].push(p);
    });
    setColumns(grouped);
    setLoading(false);
  }, [enrichedProspects]);

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('prospectId', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDragOver = (e, cat) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(cat);
  };

  const handleDrop = (e, targetCat) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('prospectId');

    let prospect = null;
    let sourceCat = null;
    for (const [cat, list] of Object.entries(columns)) {
      const found = list.find(p => p.id === id);
      if (found) { prospect = found; sourceCat = cat; break; }
    }

    if (!prospect || sourceCat === targetCat) return;

    // Snapshot before optimistic move for rollback if needed
    const previousColumns = columns;

    // Optimistic move — don't wait for the API
    setColumns(prev => ({
      ...prev,
      [sourceCat]: prev[sourceCat].filter(p => p.id !== id),
      [targetCat]: [...prev[targetCat], { ...prospect, category: targetCat }],
    }));

    patchProspect(id, targetCat, previousColumns);
  };

  const patchProspect = async (id, category, previousColumns) => {
    setPatchingIds(prev => new Set([...prev, id]));

    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${API_BASE}/prospects/${id}`, {
            method: 'PATCH',
            headers: {
              'accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ category }),
          });

          if (res.status === 401) {
            if (onSessionExpired) onSessionExpired();
            throw new Error('401');
          }

          if (res.ok) return; // Success — exit all retries

          // 4xx — don't retry
          if (res.status >= 400 && res.status < 500) {
            throw new Error('Error al actualizar prospect');
          }

          // 5xx — retry
          throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          const isAbort = err.name === 'AbortError';
          const isLastAttempt = attempt === 3;

          if (isAbort || isLastAttempt) {
            console.error(err);
            setColumns(previousColumns);
            setKanbanError('No se pudo mover el prospecto');
            setTimeout(() => setKanbanError(null), 3000);
            if (err.message === '401' && onSessionExpired) onSessionExpired();
            throw err; // re-throw to exit the outer try
          }

          // Exponential backoff: 500ms → 1000ms
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        }
      }
    } finally {
      setPatchingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="kanban-loading">
        <Loader />
      </div>
    );
  }

  return (
    <div className="kanban-board">
      {kanbanError && (
        <div className="kanban-error-banner">
          {kanbanError}
        </div>
      )}
      {CATEGORIES.map(cat => {
        const { label, accentVar } = COL_META[cat];
        const prospects = columns[cat];
        const isOver = dragOverCol === cat;

        return (
          <div
            key={cat}
            className={`kanban-col${isOver ? ' drag-over' : ''}`}
            style={{ '--col-accent': `var(${accentVar})` }}
            onDragOver={e => handleDragOver(e, cat)}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => handleDrop(e, cat)}
          >
            <div className="kanban-col-header">
              <span className="kanban-col-label">{label}</span>
              <span className="kanban-col-count">{prospects.length}</span>
            </div>

            <div className="kanban-col-body">
              {prospects.length === 0 ? (
                <div className="kanban-empty">Sin prospectos en esta categoría</div>
              ) : (
                prospects.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`kanban-card${draggingId === p.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={e => handleDragStart(e, p.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="kanban-card-top">
                      <span className="kanban-card-name">{p.name}</span>
                      <div className="loader-container small">
                        {patchingIds.has(p.id) && <Loader size="sm" />}
                      </div>
                    </div>

                    {(p.loteo_name || p.lote_name) && (
                      <span className="kanban-card-lote">
                        {p.loteo_name || '—'}
                        {p.lote_name ? ` · ${p.lote_name}` : ''}
                      </span>
                    )}

                    {p.last_contact && (
                      <span className="kanban-card-contact">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {formatRelativeContact(p.last_contact)}
                      </span>
                    )}

                    <div className="kanban-card-actions">
                      <button
                        className="kanban-action-btn whatsapp"
                        type="button"
                        aria-label="WhatsApp"
                        aria-disabled
                        title="Integración de WhatsApp coming soon"
                        disabled
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </button>
                      <button
                        className="kanban-action-btn phone"
                        type="button"
                        aria-label="Llamar"
                        aria-disabled
                        title="Integración de llamadas coming soon"
                        disabled
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"></path>
                        </svg>
                      </button>
                    </div>

                    <div className="kanban-card-divider" />

                    <div className="kanban-card-footer">
                      <AdvisorAvatar name={p.advisorName} size={22} />
                      <span className="kanban-card-advisor">
                        {p.advisorName || 'Sin asesor'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
