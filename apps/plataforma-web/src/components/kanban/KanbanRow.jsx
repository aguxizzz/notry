import { Loader } from '../../ui/components';
import { formatRelativeContact, buildWhatsAppUrl } from './kanbanFormat';
import { ClockIcon, WhatsAppIcon } from './KanbanIcons';
import './KanbanRow.css';

export default function KanbanRow({ prospect, isDragging, isPatching, onDragStart, onDragEnd }) {
  const { name, loteo_name, lote_name, last_contact, advisorName, phone } = prospect;

  const handleWhatsAppClick = () => {
    const url = buildWhatsAppUrl(phone);
    if (url) window.open(url, '_blank');
  };

  const contactLabel = formatRelativeContact(last_contact);

  return (
    <div
      className={`kanban-row${isDragging ? ' dragging' : ''}${isPatching ? ' saving' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-busy={isPatching}
    >
      <div className="kanban-row-main">
        <div className="kanban-row-id">
          <span className="kanban-row-name">{name}</span>
          {isPatching && (
            <span
              className="kanban-row-loader"
              role="status"
              aria-label="Guardando cambio"
              title="Guardando cambio"
            >
              <Loader size="sm" />
            </span>
          )}
        </div>
        {(loteo_name || lote_name) && (
          <span className="kanban-row-lote" title={lote_name ? `${loteo_name} · ${lote_name}` : loteo_name}>
            {loteo_name || '—'}
            {lote_name ? (
              <>
                <span className="kanban-row-lote-sep"> · </span>
                {lote_name}
              </>
            ) : null}
          </span>
        )}
      </div>

      <div className="kanban-row-meta">
        <span className="kanban-row-contact">
          <ClockIcon />
          {contactLabel ? `Último contacto ${contactLabel}` : 'Sin contacto aún'}
        </span>

        {advisorName && (
          <span className="kanban-row-advisor-name">{advisorName}</span>
        )}

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
    </div>
  );
}
