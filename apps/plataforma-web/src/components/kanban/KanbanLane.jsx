import KanbanRow from './KanbanRow';
import './KanbanLane.css';

export default function KanbanLane({
  meta,
  prospects,
  isDragOver,
  patchingIds,
  draggingId,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragStart,
  onDragEnd,
}) {
  const { label, accentVar } = meta;

  return (
    <section
      className={`kanban-lane${isDragOver ? ' drag-over' : ''}`}
      style={{ '--col-accent': `var(${accentVar})` }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="kanban-lane-head">
        <span className="kanban-lane-dot" />
        <span className="kanban-lane-label">{label}</span>
        <span className="kanban-lane-count">{prospects.length}</span>
      </header>

      <div className="kanban-lane-body">
        {prospects.length === 0 ? (
          <div className="kanban-empty">sin clientes en esta categoria</div>
        ) : (
          prospects.map((p) => (
            <KanbanRow
              key={p.id}
              prospect={p}
              isDragging={draggingId === p.id}
              isPatching={patchingIds.has(p.id)}
              onDragStart={(e) => onDragStart(e, p.id)}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </section>
  );
}
