import { formatRelativeContact, buildWhatsAppUrl } from './kanbanFormat';
import { ClockIcon, WhatsAppIcon } from './KanbanIcons';
import './KanbanMobileBoard.css';

function KanbanMobileRow({ prospect }) {
  const { name, last_contact, phone } = prospect;
  const contactLabel = formatRelativeContact(last_contact);

  const handleWhatsAppClick = () => {
    const url = buildWhatsAppUrl(phone);
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="kanban-mobile-row">
      <div className="kanban-mobile-row-id">
        <span className="kanban-mobile-row-name">{name}</span>
        <span className="kanban-mobile-row-contact">
          <ClockIcon />
          {contactLabel ? `Último contacto ${contactLabel}` : 'Sin contacto aún'}
        </span>
      </div>
      <button
        className="kanban-action-btn whatsapp"
        type="button"
        aria-label="WhatsApp"
        title={phone ? 'Enviar WhatsApp' : 'Sin número de teléfono'}
        onClick={handleWhatsAppClick}
        disabled={!phone}
      >
        <WhatsAppIcon />
      </button>
    </div>
  );
}

export default function KanbanMobileBoard({ categories, colMeta, columns, activeStage, onSelectStage }) {
  const items = columns[activeStage] || [];

  return (
    <div className="kanban-mobile">
      <div className="kanban-mobile-tabs" role="tablist" aria-label="Etapa">
        {categories.map((cat) => {
          const meta = colMeta[cat];
          const count = columns[cat]?.length ?? 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeStage === cat}
              className={`kanban-mobile-tab${activeStage === cat ? ' active' : ''}`}
              style={{ '--col-accent': `var(${meta.accentVar})` }}
              onClick={() => onSelectStage(cat)}
            >
              <span className="kanban-mobile-tab-dot" />
              {meta.label}
              <span className="kanban-mobile-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="kanban-mobile-list">
        {items.length === 0 ? (
          <div className="kanban-empty">sin clientes en esta categoria</div>
        ) : (
          items.map((p) => <KanbanMobileRow key={p.id} prospect={p} />)
        )}
      </div>
    </div>
  );
}
