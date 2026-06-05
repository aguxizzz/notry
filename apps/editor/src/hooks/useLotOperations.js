import { useState } from 'react';
import { API_BASE } from '../api/config';

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
  const [isCreatingLote, setIsCreatingLote] = useState(false);
  const [isSavingLote, setIsSavingLote] = useState(false);
  const [pendingMode, setPendingMode] = useState('create');
  const [assignTargetId, setAssignTargetId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const handleSaveLote = async (marker) => {
    if (!marker?.uuid) { alert('Este lote no tiene UUID asignado.'); return; }

    setIsSavingLote(true);
    try {
      const coordEndpoint = mode === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates';
      const hasCoords = marker.polygonPixels?.length >= 3;

      const metaBody = {
        ...(marker.tooltip?.trim() && { name: marker.tooltip.trim() }),
        ...(marker.slug?.trim() && { slug: marker.slug.trim() }),
        status: marker.status || marker.estado || 'available',
        ...(!isNaN(parseFloat(marker.price)) && { price: parseFloat(marker.price) }),
        ...(marker.area_m2 != null && marker.area_m2 !== '' && { area_m2: String(marker.area_m2) }),
        comments: marker.comments?.trim() || null,
      };

      const requests = [
        fetch(`${API_BASE}/lots/${marker.uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(metaBody),
        }),
        ...(hasCoords ? [
          fetch(`${API_BASE}/lots/${coordEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.polygonPixels }),
          }),
        ] : []),
      ];

      const [metaRes, coordRes] = await Promise.all(requests);

      if (metaRes.status === 401 || coordRes?.status === 401) { onAuthError(); return; }
      if (!metaRes.ok) { const msg = await metaRes.text(); alert(`Error al guardar: ${msg}`); return; }
      if (coordRes && !coordRes.ok) { alert('Metadata guardada, pero hubo un error al actualizar las coordenadas.'); }

      const updated = await metaRes.json();
      setAnnotations(prev => prev.map(a => {
        if (a.id !== selectedId) return a;
        const next = {
          ...a,
          tooltip: updated.name ?? a.tooltip,
          slug: updated.slug ?? a.slug,
          status: updated.status ?? a.status,
          price: updated.price ?? a.price,
          area_m2: updated.area_m2 ?? a.area_m2,
          comments: updated.comments ?? a.comments,
        };
        if (hasCoords) {
          if (mode === 'blueprint') next.blueprint_coordinates = marker.polygonPixels;
          else next.panorama_coordinates = marker.polygonPixels;
        }
        return next;
      }));

      alert('¡Lote guardado correctamente!');
    } catch {
      alert('Error de conexión al guardar el lote.');
    } finally {
      setIsSavingLote(false);
    }
  };

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
          ...(selectedMarker.slug?.trim() && { slug: selectedMarker.slug.trim() }),
          status: selectedMarker.status || 'available',
          ...(!isNaN(parseFloat(selectedMarker.price)) && { price: parseFloat(selectedMarker.price) }),
          ...(selectedMarker.area_m2 != null && selectedMarker.area_m2 !== '' && { area_m2: parseFloat(selectedMarker.area_m2) }),
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
    if (!confirm(`¿Eliminar el lote "${marker.tooltip || marker.uuid}" de la base de datos? Esta acción no se puede deshacer.`)) return false;
    try {
      const res = await fetch(`${API_BASE}/lots/${marker.uuid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) { onAuthError(); return false; }
      if (!res.ok) { alert(`Error al eliminar el lote: ${res.status}`); return false; }
      return true;
    } catch {
      alert('Error de conexión al intentar eliminar el lote.');
      return false;
    }
  };

  return {
    isCreatingLote,
    isSavingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleSaveLote,
    handleAssignToExistingLot,
    handleRemoveLot,
  };
}
