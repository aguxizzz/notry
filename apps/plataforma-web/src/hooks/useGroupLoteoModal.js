import { useState } from 'react';
import { addLoteoToGroup, removeLoteoFromGroup } from '../api/loteos';

/**
 * Maneja el modal de "agrupar loteo": asignar un loteo a un grupo de etapas
 * (general/etapa) o quitarlo del grupo. Actualiza el estado de forma optimista.
 */
export function useGroupLoteoModal({ apiFetch, addToast, onUpdateLoteo, refreshSync }) {
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupLoteo, setGroupLoteo] = useState(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState(null);

  const openGroupModal = (loteo) => {
    setGroupLoteo(loteo);
    setGroupError(null);
    setGroupModalOpen(true);
  };

  const closeGroupModal = () => {
    setGroupModalOpen(false);
    setGroupLoteo(null);
    setGroupError(null);
  };

  const submitGroup = async ({ targetGrupoId, tipo, orden }) => {
    if (!groupLoteo) return;
    setGroupLoading(true);
    setGroupError(null);
    try {
      const res = await addLoteoToGroup({ apiFetch, loteoId: groupLoteo.id, targetGrupoId, tipo, orden });
      onUpdateLoteo?.(groupLoteo.id, { grupo_id: res.grupo_id, tipo: res.tipo, orden: res.orden });
      addToast?.(`"${groupLoteo.name}" agrupado.`, 'success');
      closeGroupModal();
      refreshSync?.();
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setGroupLoading(false);
    }
  };

  const ungroup = async () => {
    if (!groupLoteo) return;
    setGroupLoading(true);
    setGroupError(null);
    try {
      await removeLoteoFromGroup({ apiFetch, loteoId: groupLoteo.id });
      onUpdateLoteo?.(groupLoteo.id, { grupo_id: null, tipo: null, orden: 0 });
      addToast?.(`"${groupLoteo.name}" quitado del grupo.`, 'success');
      closeGroupModal();
      refreshSync?.();
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setGroupLoading(false);
    }
  };

  return {
    groupModalOpen,
    groupLoteo,
    groupLoading,
    groupError,
    openGroupModal,
    closeGroupModal,
    submitGroup,
    ungroup,
  };
}
