import { useState } from 'react';
import { errorMessage } from '../api/client';
import { assignLotCoordinates, createLot, deleteLot } from '../api/lots';
import { parseNumberOrZero } from '../utils/saveAllUtils';
import { useUIFeedback } from './useUIFeedback';

export function useLotOperations({
  annotations,
  setAnnotations,
  selectedId,
  setSelectedId,
  token,
  loteoId,
  mode,
  onAuthError,
  onAfterCreate,
}) {
  const { confirm, notify } = useUIFeedback();
  const [isCreatingLote, setIsCreatingLote] = useState(false);
  const [pendingMode, setPendingMode] = useState('create');
  const [assignTargetId, setAssignTargetId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // 401 → logout; cualquier otro error → aviso con el motivo si lo hay.
  const reportError = (action, error) => {
    if (error?.isUnauthorized) { onAuthError(); return; }
    notify(`No se pudo ${action}: ${errorMessage(error, 'error del servidor.')}`, { variant: 'error' });
  };

  const handleAssignToExistingLot = async (selectedMarker) => {
    if (!assignTargetId || !selectedMarker) return;
    const targetLot = annotations.find(a => a.id === assignTargetId);
    if (!targetLot?.uuid) return;

    setIsAssigning(true);
    try {
      await assignLotCoordinates(token, {
        uuid: targetLot.uuid,
        polygonPoints: selectedMarker.polygonPixels || [],
        space: mode === 'blueprint' ? 'blueprint' : 'panorama',
      });

      setAnnotations(prev => prev
        .filter(a => a.id !== selectedId)
        .map(a => {
          if (a.id !== assignTargetId) return a;
          const updated = { ...a };
          if (mode === 'blueprint') updated.blueprint_coordinates = selectedMarker.polygonPixels;
          else updated.panorama_coordinates = selectedMarker.polygonPixels;
          updated.polygonPixels = selectedMarker.polygonPixels;
          return updated;
        })
      );
      setSelectedId(assignTargetId);
    } catch (error) {
      reportError('asignar las coordenadas', error);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateLote = async (selectedMarker) => {
    if (!selectedMarker?.tooltip?.trim()) { notify('El nombre es requerido.', { variant: 'error' }); return; }
    if (!loteoId) { notify('No se encontró el loteo_id.', { variant: 'error' }); return; }
    if (!selectedMarker?.polygonPixels) { notify('Seleccioná un polígono antes de crear un lote.', { variant: 'error' }); return; }

    setIsCreatingLote(true);
    try {
      const lote = await createLot(token, {
        name: selectedMarker.tooltip.trim(),
        status: selectedMarker.status || 'available',
        price: parseNumberOrZero(selectedMarker.price),
        area_m2: parseNumberOrZero(selectedMarker.area_m2),
        ...(selectedMarker.comments?.trim() && { comments: selectedMarker.comments.trim() }),
        loteo_id: loteoId,
        ...(mode === 'blueprint'
          ? { blueprint_coordinates: selectedMarker.polygonPixels }
          : { coordinates_360: selectedMarker.polygonPixels }),
      });
      setAnnotations(prev => prev.map(a =>
        a.id === selectedId ? {
          ...a,
          id: lote.id,
          uuid: lote.id,
          pending: false,
          tooltip: lote.name,
          price: lote.price,
          area_m2: lote.area_m2,
          status: lote.status,
          slug: lote.slug,
          comments: lote.comments,
          ...(mode === 'blueprint'
            ? { blueprint_coordinates: a.polygonPixels }
            : { panorama_coordinates: a.polygonPixels }),
        } : a
      ));
      setSelectedId(lote.id);
      onAfterCreate?.();
    } catch (error) {
      reportError('crear el lote', error);
    } finally {
      setIsCreatingLote(false);
    }
  };

  const handleRemoveLot = async (marker) => {
    if (!marker.uuid) return true;
    const confirmed = await confirm(
      `¿Eliminar el lote "${marker.tooltip || marker.uuid}" de la base de datos? Esta acción no se puede deshacer.`,
      { title: 'Eliminar lote', danger: true, confirmLabel: 'Eliminar' }
    );
    if (!confirmed) return false;
    try {
      await deleteLot(token, marker.uuid);
      return true;
    } catch (error) {
      reportError('eliminar el lote', error);
      return false;
    }
  };

  return {
    isCreatingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleAssignToExistingLot,
    handleRemoveLot,
  };
}
