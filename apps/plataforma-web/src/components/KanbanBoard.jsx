import { useState, useEffect, useMemo } from 'react';
import { Loader } from '../ui/components';
import { usePatchProspect } from '../hooks/usePatchProspect';
import KanbanLane from './kanban/KanbanLane';
import KanbanMobileBoard from './kanban/KanbanMobileBoard';
import './KanbanBoard.css';

const CATEGORIES = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];

const COL_META = {
  primer_contacto: { label: 'Primer Contacto', accentVar: '--kanban-contacto-accent' },
  seguimiento:     { label: 'Seguimiento',      accentVar: '--kanban-seguimiento-accent' },
  negociacion:     { label: 'Negociación',       accentVar: '--kanban-negociacion-accent' },
  vendido:         { label: 'Vendido',           accentVar: '--kanban-vendido-accent' },
};

export default function KanbanBoard({ token, onSessionExpired, prospectosList = [], loteos = [], advisorsList = [], onUpdateProspectCategory, apiFetch, loteOwnerId, addActivity }) {
  const [columns, setColumns] = useState({
    primer_contacto: [],
    seguimiento: [],
    negociacion: [],
    vendido: [],
  });
  const [loading, setLoading] = useState(true);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [kanbanError, setKanbanError] = useState(null);
  const [activeMobileStage, setActiveMobileStage] = useState(CATEGORIES[0]);

  const { patchProspect, patchingIds } = usePatchProspect({
    token,
    onSessionExpired,
    onError: (msg) => {
      setKanbanError(msg);
      setTimeout(() => setKanbanError(null), 3000);
    },
    apiFetch,
    loteOwnerId,
    addActivity,
  });

  const enrichedProspects = useMemo(() => {
    const loteoMap = {};
    loteos.forEach(l => { loteoMap[l.id] = l.name; });
    const loteMap = {};
    loteos.forEach(loteo => {
      (loteo.lotes || []).forEach(lot => {
        loteMap[lot.id] = { name: lot.name, loteo_name: loteo.name };
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

  useEffect(() => {
    const grouped = { primer_contacto: [], seguimiento: [], negociacion: [], vendido: [] };
    enrichedProspects.forEach(p => {
      if (grouped[p.category] !== undefined) grouped[p.category].push(p);
    });
    // The board state mirrors the incoming prospect list after sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(grouped);
    setLoading(false);
  }, [enrichedProspects]);

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('prospectId', id);
    e.dataTransfer.effectAllowed = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(e.currentTarget, e.clientX - rect.left, e.clientY - rect.top);
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

    const previousColumns = columns;

    setColumns(prev => ({
      ...prev,
      [sourceCat]: prev[sourceCat].filter(p => p.id !== id),
      [targetCat]: [...prev[targetCat], { ...prospect, category: targetCat }],
    }));

    patchProspect(
      id,
      targetCat,
      previousColumns,
      setColumns,
      () => onUpdateProspectCategory?.(id, targetCat),
      prospect?.name
    );
  };

  if (loading) {
    return (
      <div className="kanban-board-wrapper">
        <div className="kanban-loading">
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <div className="kanban-board-wrapper">
      {kanbanError && (
        <div className="kanban-error-banner">
          {kanbanError}
        </div>
      )}

      <div className="kanban-lanes">
        {CATEGORIES.map(cat => (
          <KanbanLane
            key={cat}
            meta={COL_META[cat]}
            prospects={columns[cat]}
            isDragOver={dragOverCol === cat}
            patchingIds={patchingIds}
            draggingId={draggingId}
            onDragOver={(e) => handleDragOver(e, cat)}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, cat)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      <KanbanMobileBoard
        categories={CATEGORIES}
        colMeta={COL_META}
        columns={columns}
        activeStage={activeMobileStage}
        onSelectStage={setActiveMobileStage}
      />
    </div>
  );
}
