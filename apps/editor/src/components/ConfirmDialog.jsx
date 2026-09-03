import { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  danger = false,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    confirmBtnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="confirm-dialog-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={title || confirmLabel}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={`confirm-dialog-card${danger ? ' is-danger' : ''}`}>
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon">
            <Icon size={18} />
          </div>
          <div className="confirm-dialog-copy">
            {title && <strong>{title}</strong>}
            <span>{message}</span>
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="editor-text-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`editor-btn ${danger ? 'editor-btn--danger' : 'editor-btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
