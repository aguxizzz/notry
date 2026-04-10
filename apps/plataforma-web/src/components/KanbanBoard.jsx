import { useState, useEffect } from 'react';

const API_BASE = 'https://notry-back.onrender.com/api/v1';

const CATEGORIES = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];

const COL_META = {
  primer_contacto: { label: 'Primer Contacto', accent: '#818cf8' },
  seguimiento:     { label: 'Seguimiento',      accent: '#60a5fa' },
  negociacion:     { label: 'Negociación',       accent: '#fbbf24' },
  vendido:         { label: 'Vendido',           accent: '#34d399' },
};

export default function KanbanBoard({ token, onSessionExpired }) {
  const [columns, setColumns] = useState({
    primer_contacto: [],
    seguimiento: [],
    negociacion: [],
    vendido: [],
  });
  const [loading, setLoading] = useState(true);
  const [patchingIds, setPatchingIds] = useState(new Set());
  const [dragOverCol, setDragOverCol] = useState(null);
  const [kanbanError, setKanbanError] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/prospects?limit=100&offset=0`, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      const grouped = { primer_contacto: [], seguimiento: [], negociacion: [], vendido: [] };
      data.items.forEach(p => {
        if (grouped[p.category] !== undefined) grouped[p.category].push(p);
      });
      setColumns(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('prospectId', id);
    e.dataTransfer.effectAllowed = 'move';
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
      const res = await fetch(`${API_BASE}/prospects/${id}`, {
        method: 'PATCH',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error('Error al actualizar prospect');
    } catch (err) {
      console.error(err);
      // Rollback on error
      setColumns(previousColumns);
      // Show error banner
      setKanbanError('No se pudo mover el prospecto');
      setTimeout(() => setKanbanError(null), 3000);
      // Handle session expiration
      if (err.message?.includes('401') && onSessionExpired) {
        onSessionExpired();
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
        <span className="loader" />
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
        const { label, accent } = COL_META[cat];
        const prospects = columns[cat];
        const isOver = dragOverCol === cat;

        return (
          <div
            key={cat}
            className={`kanban-col${isOver ? ' drag-over' : ''}`}
            style={{ '--col-accent': accent }}
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
                prospects.map(p => (
                  <div
                    key={p.id}
                    className="kanban-card"
                    draggable
                    onDragStart={e => handleDragStart(e, p.id)}
                  >
                    <div className="kanban-card-top">
                      <span className="kanban-card-name">{p.name}</span>
                      {patchingIds.has(p.id) && <span className="loader card-loader" />}
                    </div>
                    {(p.phone || p.email) && (
                      <span className="kanban-card-sub">{p.phone || p.email}</span>
                    )}
                    {p.budget && (
                      <span className="kanban-card-budget">
                        ${parseFloat(p.budget).toLocaleString()}
                      </span>
                    )}
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
