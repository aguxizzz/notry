import { useState } from 'react';
import { errorMessage } from '../api/client';
import { assignLotCoordinates, createLot, deleteLot } from '../api/lots';
import { getShapeCoords, reinsertAnnotation, spaceForMode, withShapeCoords } from '../utils/annotationModel';
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
      const coords = getShapeCoords(selectedMarker, mode);
      await assignLotCoordinates(token, {
        uuid: targetLot.uuid,
        polygonPoints: coords,
        space: spaceForMode(mode),
      });

      // El polígono pendiente desaparece: su geometría pasa al lote elegido.
      setAnnotations(prev => prev
        .filter(a => a.id !== selectedId)
        .map(a => (a.id === assignTargetId ? withShapeCoords(a, mode, coords) : a))
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
    const coords = getShapeCoords(selectedMarker, mode);
    if (!coords.length) { notify('Seleccioná un polígono antes de crear un lote.', { variant: 'error' }); return; }

    setIsCreatingLote(true);
    try {
      const lote = await createLot(token, {
        name: selectedMarker.tooltip.trim(),
        status: selectedMarker.status || 'available',
        price: parseNumberOrZero(selectedMarker.price),
        area_m2: parseNumberOrZero(selectedMarker.area_m2),
        ...(selectedMarker.comments?.trim() && { comments: selectedMarker.comments.trim() }),
        loteo_id: loteoId,
        ...(spaceForMode(mode) === 'blueprint'
          ? { blueprint_coordinates: coords }
          : { coordinates_360: coords }),
      });
      setAnnotations(prev => prev.map(a =>
        a.id === selectedId ? withShapeCoords({
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
        }, mode, coords) : a
      ));
      setSelectedId(lote.id);
      onAfterCreate?.();
    } catch (error) {
      reportError('crear el lote', error);
    } finally {
      setIsCreatingLote(false);
    }
  };

  // Eliminar un lote guardado de la base (no se puede deshacer). Es
  // optimista: tras confirmar, el lote desaparece al toque y la API corre
  // atrás; si falla, vuelve a su lugar. `onDeleted` corre solo si la API
  // confirmó (App limpia ahí el snapshot de guardado y el historial).
  const handleDeleteLot = async (marker, { onDeleted } = {}) => {
    const original = annotations.find(a => a.id === marker?.id);
    if (!original?.uuid) return;
    const confirmed = await confirm(
      `¿Eliminar el lote "${original.tooltip || original.uuid}" de la base de datos? Esta acción no se puede deshacer.`,
      { title: 'Eliminar lote', danger: true, confirmLabel: 'Eliminar' }
    );
    if (!confirmed) return;
    const index = annotations.indexOf(original);
    setAnnotations(prev => prev.filter(a => a.id !== original.id));
    setSelectedId(prev => (prev === original.id ? null : prev));
    try {
      await deleteLot(token, original.uuid);
      onDeleted?.(original);
    } catch (error) {
      setAnnotations(prev => reinsertAnnotation(prev, original, index));
      reportError('eliminar el lote', error);
    }
  };

  return {
    isCreatingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleAssignToExistingLot,
    handleDeleteLot,
  };
}
