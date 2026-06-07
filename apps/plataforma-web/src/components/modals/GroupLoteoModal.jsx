import React, { useMemo, useState } from 'react';
import { Layers, Unlink } from 'lucide-react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';
import './GroupLoteoModal.css';

const TIPO_LABEL = { general: 'imagen general', etapa: 'etapa' };

/**
 * GroupLoteoModal — asigna un loteo a un grupo de etapas (general/etapa)
 * o lo quita del grupo al que pertenece.
 *
 * @param {Object}   props.loteo    - loteo que se está agrupando
 * @param {Array}    props.loteos   - todos los loteos (para derivar grupos existentes)
 * @param {Function} props.onSubmit - ({ targetGrupoId, tipo, orden }) => void
 * @param {Function} props.onUngroup
 */
export default function GroupLoteoModal({
  isOpen,
  onClose,
  loteo,
  loteos,
  onSubmit,
  onUngroup,
  loading,
  error,
}) {
  const isGrouped = !!loteo?.grupo_id;

  const otherGroups = useMemo(() => {
    const map = new Map();
    for (const l of loteos || []) {
      if (!l.grupo_id) continue;
      if (!map.has(l.grupo_id)) map.set(l.grupo_id, []);
      map.get(l.grupo_id).push(l);
    }
    return [...map.entries()]
      .filter(([grupoId]) => grupoId !== loteo?.grupo_id)
      .map(([grupoId, members]) => {
        const general = members.find(m => m.tipo === 'general');
        return {
          grupoId,
          label: general ? general.name : (members[0]?.name ?? 'Grupo'),
          hasGeneral: !!general,
          etapasCount: members.filter(m => m.tipo === 'etapa').length,
        };
      });
  }, [loteos, loteo?.grupo_id]);

  const [destination, setDestination] = useState('new'); // 'new' | grupoId
  const [tipo, setTipo] = useState('etapa');

  if (!isOpen || !loteo) return null;

  const targetGroup = destination === 'new' ? null : otherGroups.find(g => g.grupoId === destination);
  const generalTaken = !!targetGroup?.hasGeneral && tipo === 'general';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (generalTaken) return;
    const targetGrupoId = destination === 'new' ? null : destination;
    const orden = tipo === 'etapa' ? (targetGroup ? targetGroup.etapasCount : 0) : 0;
    onSubmit({ targetGrupoId, tipo, orden });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} aria-modal="true" role="dialog">
        <h3 className="modal-title">
          <Layers size={18} style={{ marginRight: 8, verticalAlign: '-3px' }} />
          Agrupar “{loteo.name}”
        </h3>

        {isGrouped ? (
          <>
            <p className="group-modal-note">
              Este loteo ya pertenece a un grupo como <strong>{TIPO_LABEL[loteo.tipo] ?? 'etapa'}</strong>.
              Para moverlo a otro grupo, primero quitalo de este.
            </p>
            {error && <div className="status-message error">{error}</div>}
            <div className="modal-footer">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
                Cerrar
              </Button>
              <Button type="button" size="sm" variant="outline" className="group-danger-btn" onClick={onUngroup} loading={loading}>
                {loading ? <Loader size="sm" /> : (<><Unlink size={15} style={{ marginRight: 6 }} />Quitar del grupo</>)}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="group-destination">Grupo</label>
              <select
                id="group-destination"
                value={destination}
                onChange={e => setDestination(e.target.value)}
              >
                <option value="new">Crear grupo nuevo</option>
                {otherGroups.map(g => (
                  <option key={g.grupoId} value={g.grupoId}>Unir a “{g.label}”</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="group-tipo">Rol en el grupo</label>
              <select id="group-tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="etapa">Etapa</option>
                <option value="general">Imagen general</option>
              </select>
              <p className="group-modal-hint">
                La imagen general lleva los POIs y textos de los alrededores. Es opcional, pero recomendada (una por grupo).
              </p>
            </div>

            {generalTaken && (
              <div className="status-message error">
                Ese grupo ya tiene una imagen general. Elegí “Etapa” o quitá la general actual.
              </div>
            )}
            {error && <div className="status-message error">{error}</div>}

            <div className="modal-footer">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" loading={loading} disabled={generalTaken}>
                {loading ? <Loader size="sm" /> : 'Agrupar'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
