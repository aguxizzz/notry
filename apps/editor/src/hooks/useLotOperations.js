import { useState } from 'react';
import { errorMessage } from '../api/client';
import { assignLotCoordinates, createLot, deleteLot } from '../api/lots';
import { getShapeCoords, reinsertAnnotation, spaceForMode, withShapeCoords } from '../utils/annotationModel';
import { parseNumberOrZero } from '../utils/saveAllUtils';
import { useUIFeedback } from './useUIFeedback';

export function useLotOperations({
  annotations,
  setAnnotations,
  setSelectedId,
  token,
  loteoId,
  mode,
  onAuthError,
  // (createdLot, annotationsAtCreate, tempId) cuando el back confirmó un
  // lote nuevo: App lo suma a la foto de "lo último guardado".
  onAfterCreate,
  // (lotId, mode, coords) cuando el back confirmó una asignación: App lo
  // usa para que el "cambios sin guardar" no cuente algo que ya está en la base.
  onAfterAssign,
}) {
  const { confirm, notify } = useUIFeedback();
  const [pendingMode, setPendingMode] = useState('create');
  const [assignTargetId, setAssignTargetId] = useState('');

  // 401 → logout; cualquier otro error → aviso con el motivo si lo hay.
  const reportError = (action, error) => {
    if (error?.isUnauthorized) { onAuthError(); return; }
    notify(`No se pudo ${action}: ${errorMessage(error, 'error del servidor.')}`, { variant: 'error' });
  };

  // Asignar el dibujo pendiente a un lote que ya existe. Es optimista: el
  // lote toma la forma al toque y la API corre atrás; si falla, el polígono
  // pendiente vuelve y el lote recupera la forma que tenía en esta vista.
  const handleAssignToExistingLot = async (selectedMarker) => {
    if (!assignTargetId || !selectedMarker) return;
    const targetLot = annotations.find(a => a.id === assignTargetId);
    if (!targetLot?.uuid) return;

    const pending = annotations.find(a => a.id === selectedMarker.id) ?? selectedMarker;
    const pendingIndex = annotations.indexOf(pending);
    const coords = getShapeCoords(selectedMarker, mode);
    const previousCoords = getShapeCoords(targetLot, mode);
    const targetId = targetLot.id;
    // `mode` se fija acá: si el usuario cambia de vista mientras la API
    // responde, el rollback tiene que tocar la geometría de esta vista.
    const assignedMode = mode;

    // El polígono pendiente desaparece: su geometría pasa al lote elegido.
    setAnnotations(prev => prev
      .filter(a => a.id !== pending.id)
      .map(a => (a.id === targetId ? withShapeCoords(a, assignedMode, coords) : a))
    );
    setSelectedId(targetId);

    try {
      await assignLotCoordinates(token, {
        uuid: targetLot.uuid,
        polygonPoints: coords,
        space: spaceForMode(assignedMode),
      });
      onAfterAssign?.(targetId, assignedMode, coords);
    } catch (error) {
      // Solo se revierte la forma en esta vista, no el lote entero: si
      // mientras tanto se editó otra cosa del lote, eso no se pierde.
      setAnnotations(prev => reinsertAnnotation(
        prev.map(a => (a.id === targetId ? withShapeCoords(a, assignedMode, previousCoords) : a)),
        pending,
        pendingIndex,
      ));
      // Solo se le devuelve la selección si sigue mirando el lote asignado.
      setSelectedId(prev => (prev === targetId ? pending.id : prev));
      reportError('asignar las coordenadas', error);
    }
  };

  // Crear un lote nuevo con el dibujo pendiente. Es optimista: el polígono
  // pasa a lote al toque (con un id temporal y `creating: true`) y la API
  // corre atrás; cuando responde, el id temporal se cambia por el real. Si
  // falla, vuelve a quedar pendiente con lo que se había cargado.
  const handleCreateLote = async (selectedMarker) => {
    if (!selectedMarker?.tooltip?.trim()) { notify('El nombre es requerido.', { variant: 'error' }); return; }
    if (!loteoId) { notify('No se encontró el loteo_id.', { variant: 'error' }); return; }
    const coords = getShapeCoords(selectedMarker, mode);
    if (!coords.length) { notify('Seleccioná un polígono antes de crear un lote.', { variant: 'error' }); return; }

    const tempId = selectedMarker.id;
    const createdMode = mode;
    const name = selectedMarker.tooltip.trim();
    const status = selectedMarker.status || 'available';
    const price = parseNumberOrZero(selectedMarker.price);
    const area = parseNumberOrZero(selectedMarker.area_m2);
    const comments = selectedMarker.comments?.trim();
    // Se guarda el lugar en la lista para que App ubique el lote en la foto
    // de "lo último guardado" en el mismo orden que en pantalla.
    const annotationsAtCreate = annotations;

    // En pantalla ya es un lote con los valores normalizados que viajan al back.
    const optimistic = annotation => withShapeCoords({
      ...annotation,
      pending: false,
      creating: true,
      tooltip: name,
      status,
      price,
      area_m2: area,
      comments: comments || '',
    }, createdMode, coords);
    const snapshot = optimistic(annotations.find(a => a.id === tempId) ?? selectedMarker);
    setAnnotations(prev => prev.map(a => (a.id === tempId ? optimistic(a) : a)));

    try {
      const lote = await createLot(token, {
        name,
        status,
        price,
        area_m2: area,
        ...(comments && { comments }),
        loteo_id: loteoId,
        ...(spaceForMode(createdMode) === 'blueprint'
          ? { blueprint_coordinates: coords }
          : { coordinates_360: coords }),
      });
      // Solo se completa lo que pone el back (id, slug): si mientras tanto
      // se editó el nombre o el precio, esos cambios no se pisan.
      const confirmed = annotation => {
        const next = { ...annotation, id: lote.id, uuid: lote.id, slug: lote.slug };
        delete next.creating;
        return next;
      };
      setAnnotations(prev => prev.map(a => (a.id === tempId ? confirmed(a) : a)));
      setSelectedId(prev => (prev === tempId ? lote.id : prev));
      onAfterCreate?.(confirmed(snapshot), annotationsAtCreate, tempId);
    } catch (error) {
      setAnnotations(prev => prev.map(a => {
        if (a.id !== tempId) return a;
        const reverted = { ...a, pending: true };
        delete reverted.creating;
        return reverted;
      }));
      reportError('crear el lote', error);
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
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    handleCreateLote,
    handleAssignToExistingLot,
    handleDeleteLot,
  };
}
