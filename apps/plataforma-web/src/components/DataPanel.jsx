import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Panel } from '../ui/components';
import ConfirmModal from './ConfirmModal';
import { resetOrgAnalytics } from '../api/organizations';

export default function DataPanel({ apiFetch, addToast }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      const result = await resetOrgAnalytics({ apiFetch });
      const total = (result?.visor_events_deleted ?? 0) + (result?.lote_clicks_deleted ?? 0);
      addToast?.(
        total > 0
          ? `Datos de medición eliminados (${total} registros)`
          : 'No había datos de medición para eliminar',
        'success'
      );
      setConfirmOpen(false);
    } catch (err) {
      addToast?.(err.message || 'No se pudieron eliminar los datos de medición', 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <Panel as="section" className="cfg-card data-panel" flush>
      <div className="cfg-card-head">
        <div className="cfg-card-head-title">
          <h3>Datos</h3>
        </div>
      </div>

      <div className="cfg-card-body">
        <div className="cfg-field">
          <span className="cfg-field-label">Datos de medición</span>
          <div className="cfg-field-row">
            <span className="cfg-field-value">
              Sesiones, pasos del embudo y clicks registrados en el visor público.
            </span>
            <Button type="button" variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={14} /> Borrar datos
            </Button>
          </div>
          <span className="cfg-field-note">
            Borra el embudo de conversión y los clicks del visor. No afecta a los prospectos.
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="¿Borrar datos de medición?"
        message="Se eliminará todo el historial de sesiones, embudo de conversión y clicks del visor público de esta organización. Esta acción no se puede deshacer."
        confirmLabel="Borrar datos"
        loading={resetting}
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </Panel>
  );
}
