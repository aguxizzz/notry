import { useEffect, useRef } from 'react';

// Se usa a través de `useConfirm`. Enter confirma, Esc o clic afuera cancela.
export default function ConfirmDialog({ title, message, confirmLabel = 'Borrar', onClose }) {
  const confirmButton = useRef(null);

  useEffect(() => confirmButton.current?.focus(), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="modal card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{title}</h3>
        {message && <p className="muted">{message}</p>}
        <div className="inline modal-actions">
          <button onClick={() => onClose(false)}>Cancelar</button>
          <button ref={confirmButton} className="danger-solid" onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
