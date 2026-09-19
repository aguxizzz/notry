// Tooltip flotante con datos de un prospecto (categoría, contacto, email, notas).
// Se monta en document.body via createPortal. Posicionamiento inteligente: si
// no hay espacio arriba del trigger, se renderiza debajo. Cierra con click-outside
// o tecla Escape.
//
// Reutilizable: cualquier vista que muestre prospectos puede usarlo. Solo necesita
// pasarle el prospecto y el elemento que disparó el tooltip.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Mail, Clock, MessageCircle, X } from 'lucide-react';
import { CATEGORY_DISPLAY } from '../../constants';
import { formatRelativeContact } from './inventoryStats';
import { buildWhatsAppUrl } from '../kanban/kanbanFormat';
import { WhatsAppIcon } from '../kanban/KanbanIcons';
import './ProspectoTooltip.css';

export default function ProspectoTooltip({ prospecto, triggerEl, onClose, onNavigateToProspect }) {
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState({});
  const [positionBottom, setPositionBottom] = useState(false);

  useEffect(() => {
    if (!triggerEl) return;
    const update = () => {
      const rect = triggerEl.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current ? tooltipRef.current.offsetHeight : 200;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const isBottom = spaceAbove < tooltipHeight + 16 && spaceBelow > tooltipHeight + 16;
      setPositionBottom(isBottom);
      const left = Math.min(rect.left, window.innerWidth - 296);
      if (isBottom) {
        setCoords({ top: rect.bottom + 8, left, bottom: 'auto' });
      } else {
        setCoords({ bottom: window.innerHeight - rect.top + 8, left, top: 'auto' });
      }
    };
    update();
    const t = setTimeout(update, 0);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { clearTimeout(t); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [triggerEl]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) && !triggerEl?.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => { document.removeEventListener('mousedown', handleOutside); document.removeEventListener('keydown', handleEsc); };
  }, [triggerEl, onClose]);

  const contactLabel = formatRelativeContact(prospecto.last_contact);
  const categoryLabel = CATEGORY_DISPLAY[prospecto.category] ?? prospecto.category;
  const whatsappUrl = buildWhatsAppUrl(prospecto.phone);

  return createPortal(
    <div
      ref={tooltipRef}
      className={`prospecto-tooltip${positionBottom ? ' bottom' : ''}`}
      style={{ position: 'fixed', margin: 0, ...coords }}
    >
      <div className="prospecto-tooltip-header">
        <div className="prospecto-tooltip-header-main">
          <button
              className="prospecto-tooltip-name-btn"
              onClick={() => { onNavigateToProspect(prospecto.id); onClose(); }}
              title="Ver en tabla de prospectos"
            >
              {prospecto.name}
            </button>
          {prospecto.category && (
            <span className={`prospecto-tooltip-badge category-${prospecto.category}`}>
              {categoryLabel}
            </span>
          )}
        </div>
        <button className="prospecto-tooltip-close" onClick={onClose} aria-label="Cerrar">
          <X size={14} />
        </button>
      </div>
      <div className="prospecto-tooltip-body">
        {prospecto.phone && (
          <div className="prospecto-tooltip-row prospecto-tooltip-row--phone">
            <Phone size={13} className="prospecto-tooltip-icon" />
            <span>{prospecto.phone}</span>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="prospecto-tooltip-whatsapp-btn"
                title="Enviar WhatsApp"
                aria-label="Enviar WhatsApp"
                onClick={(e) => e.stopPropagation()}
              >
                <WhatsAppIcon />
              </a>
            )}
          </div>
        )}
        {prospecto.email && (
          <div className="prospecto-tooltip-row">
            <Mail size={13} className="prospecto-tooltip-icon" />
            <span>{prospecto.email}</span>
          </div>
        )}
        <div className="prospecto-tooltip-row">
          <Clock size={13} className={`prospecto-tooltip-icon${!contactLabel ? ' muted' : ''}`} />
          <span className={!contactLabel ? 'prospecto-tooltip-muted' : ''}>
            {contactLabel ? `Último contacto: ${contactLabel}` : 'Sin contacto aún'}
          </span>
        </div>
        {prospecto.observation_notes && (
          <div className="prospecto-tooltip-row prospecto-tooltip-row--notes">
            <MessageCircle size={13} className="prospecto-tooltip-icon" />
            <span className="prospecto-tooltip-notes-text">{prospecto.observation_notes}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}