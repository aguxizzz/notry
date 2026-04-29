import { Button } from '../ui/components';

export default function ConfirmDialog({ isOpen, lot, loading, onConfirm, onCancel }) {
  if (!isOpen) return null;

  const hasProspects = lot?.prospect_names && lot.prospect_names.length > 0;

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
    >
      <div
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
        <h3 className="confirm-title">¿Eliminar lote?</h3>
        <p className="confirm-message">
          Estás a punto de eliminar <strong>"{lot?.name}"</strong>. Esta acción no se puede deshacer.
        </p>

        {hasProspects && (
          <div className="delete-confirm-warning">
            <div className="warning-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Al eliminar este lote también se eliminarán los siguientes prospectos:</span>
            </div>
            <div className="prospect-list">
              {lot.prospect_names.map((prospectName, index) => (
                <div key={index} className="prospect-item">
                  <span className="prospect-dot" />
                  {prospectName}
                </div>
              ))}
            </div>
            <p className="warning-note">Si es necesario, puedes reasignar estos prospectos a otros lotes antes de eliminar.</p>
          </div>
        )}

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
