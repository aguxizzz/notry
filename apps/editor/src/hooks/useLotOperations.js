import { useState } from 'react';
import { API_BASE } from '../api/config';
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

  const handleAssignToExistingLot = async (selectedMarker) => {
    if (!assignTargetId || !selectedMarker) return;
    const targetLot = annotations.find(a => a.id === assignTargetId);
    if (!targetLot?.uuid) return;

    setIsAssigning(true);
    try {
      const endpoint = mode === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates';
      const response = await fetch(`${API_BASE}/lots/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ uuid: targetLot.uuid, polygonPoints: selectedMarker.polygonPixels || [] }),
      });
      if (response.status === 401) { onAuthError(); return; }
      if (!response.ok) { alert('Error al asignar coordenadas'); return; }

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
    } catch {
      alert('Error de conexión al asignar coordenadas.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateLote = async (selectedMarker) => {
    if (!selectedMarker?.tooltip?.trim()) { alert('El nombre es requerido.'); return; }
    if (!loteoId) { alert('No se encontró el loteo_id.'); return; }
    if (!selectedMarker?.polygonPixels) { alert('Por favor, selecciona un polígono antes de crear un lote.'); return; }

    setIsCreatingLote(true);
    try {
      const res = await fetch(`${API_BASE}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: selectedMarker.tooltip.trim(),
          status: selectedMarker.status || 'available',
          price: parseNumberOrZero(selectedMarker.price),
          area_m2: parseNumberOrZero(selectedMarker.area_m2),
          ...(selectedMarker.comments?.trim() && { comments: selectedMarker.comments.trim() }),
          loteo_id: loteoId,
          ...(mode === 'blueprint'
            ? { blueprint_coordinates: selectedMarker.polygonPixels }
            : { coordinates_360: selectedMarker.polygonPixels }),
        }),
      });
      if (res.status === 401) { onAuthError(); return; }
      if (!res.ok) { const msg = await res.text(); alert(`Error al crear lote: ${msg}`); return; }

      const lote = await res.json();
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
    } catch {
      alert('Error de conexión al crear el lote.');
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
      const res = await fetch(`${API_BASE}/lots/${marker.uuid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) { onAuthError(); return false; }
      if (!res.ok) { notify(`Error al eliminar el lote: ${res.status}`, { variant: 'error' }); return false; }
      return true;
    } catch {
      notify('Error de conexión al intentar eliminar el lote.', { variant: 'error' });
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
