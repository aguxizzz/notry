import { useRef, useEffect } from 'react';
import { Button } from '../ui/components';
import '../ui/components/Modal.css';

export default function DeleteLoteoDialog({ isOpen, loteo, loading, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable?.length > 0) focusable[0].focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        ref={modalRef}
        className="modal-card delete-confirm"
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <div className="confirm-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 className="confirm-title">¿Eliminar loteo?</h3>
        <p className="confirm-message">
          Estás a punto de eliminar <strong>"{loteo?.name}"</strong>. Esta acción no se puede deshacer.
        </p>
        <div className="confirm-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            loading={loading}
          >
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}
