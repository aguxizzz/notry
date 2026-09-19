// Bottom sheet para las acciones de una fila de tabla en mobile (<768px),
// donde ni la columna de acciones ni el acordeón inline entran cómodos.
// Reemplaza el click sobre la fila: abre desde abajo con las mismas acciones
// que en desktop, con labels y touch targets más grandes.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './RowActionsSheet.css';

export default function RowActionsSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="row-sheet-overlay" onClick={onClose}>
      <div
        className="row-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="row-sheet-handle" aria-hidden="true" />
        <div className="row-sheet-header">
          <span className="row-sheet-title">{title}</span>
          <button className="row-sheet-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="row-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
