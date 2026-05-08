import { useRef, useEffect, useState } from 'react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';

export default function UpdateContactModal({ isOpen, isClosing, loading, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [observationNotes, setObservationNotes] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setObservationNotes('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable?.length > 0) focusable[0].focus();
    } else if (!isClosing) {
      previousFocusRef.current?.focus();
    }
  }, [isOpen, isClosing]);

  const handleConfirm = () => {
    onConfirm(observationNotes);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`modal-overlay ${isClosing ? 'modal-overlay--closing' : ''}`}
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="modal-card"
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <h3 className="modal-title">Actualizar Contacto</h3>
        <p className="update-contact-description">
          Se registrará la fecha y hora actual como último contacto con este prospecto.
        </p>

        <div className="update-contact-form-group">
          <label htmlFor="observation-notes">Observaciones</label>
          <textarea
            id="observation-notes"
            maxLength={500}
            placeholder="Ej: Visitó el sitio, interesado en opciones de financiamiento..."
            value={observationNotes}
            onChange={e => setObservationNotes(e.target.value)}
            disabled={loading}
            className="update-contact-textarea"
          />
          <div className="update-contact-counter">
            {observationNotes.length}/500
          </div>
        </div>

        <div className="modal-footer">
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
            onClick={handleConfirm}
            disabled={loading}
            loading={loading}
          >
            {loading ? <Loader size="sm" /> : 'Actualizar Contacto'}
          </Button>
        </div>
      </div>
    </div>
  );
}
