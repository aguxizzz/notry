import KanbanCard from './KanbanCard';
import './KanbanColumn.css';

export default function KanbanColumn({
  category,
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
  AdvisorAvatarComponent,
}) {
  const { label, accentVar } = meta;

  return (
    <div
      className={`kanban-col${isDragOver ? ' drag-over' : ''}`}
      style={{ '--col-accent': `var(${accentVar})` }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="kanban-col-header">
        <span className="kanban-col-label">{label}</span>
        <span className="kanban-col-count">{prospects.length}</span>
      </div>

      <div className="kanban-col-body">
        {prospects.length === 0 ? (
          <div className="kanban-empty">sin clientes en esta categoria</div>
        ) : (
          prospects.map((p) => (
            <KanbanCard
              key={p.id}
              prospect={p}
              isDragging={draggingId === p.id}
              isPatching={patchingIds.has(p.id)}
              onDragStart={(e) => onDragStart(e, p.id)}
              onDragEnd={onDragEnd}
              AdvisorAvatarComponent={AdvisorAvatarComponent}
            />
          ))
        )}
      </div>
    </div>
  );
}