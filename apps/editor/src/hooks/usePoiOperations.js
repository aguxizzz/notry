import { useState } from 'react';
import { createPoi, updatePoi, deletePoi, updatePoiCoordinates, updatePoiBlueprintCoordinates } from '../services/poiService';

export function usePoiOperations({
  setAnnotations,
  selectedId,
  setSelectedId,
  token,
  loteoId,
  mode,
  onAfterCreate,
  onAuthError,
}) {
  const [isCreatingPoi, setIsCreatingPoi] = useState(false);
  const [isSavingPoi, setIsSavingPoi] = useState(false);

  const handleCreatePoi = async (form, polygonPixels) => {
    if (!form.title.trim()) { alert('El título es requerido.'); return; }
    if (!loteoId) { alert('No se encontró el loteo_id.'); return; }
    if (!polygonPixels || polygonPixels.length < 3) { alert('Por favor, dibuja un polígono antes de crear el POI.'); return; }

    setIsCreatingPoi(true);
    try {
      const payload = {
        loteo_id: loteoId,
        title: form.title.trim(),
        icon_type: form.icon_type.trim() || null,
        description: form.description.trim() || null,
        link_url: form.link_url.trim() || null,
        color: form.color || '#14b8a6',
        target_loteo_id: form.target_loteo_id || null,
        ...(mode === 'blueprint'
          ? { blueprint_coordinates: polygonPixels }
          : { coordinates_360: polygonPixels }),
      };
      const res = await createPoi(token, payload);

      if (res?.id) {
        setAnnotations(prev => prev.map(a =>
          a.id === selectedId ? {
            ...a,
            id: res.id,
            uuid: res.id,
            pending: false,
            tooltip: res.title,
            title: res.title,
            icon_type: res.icon_type,
            description: res.description,
            link_url: res.link_url,
            color: res.color,
            target_loteo_id: res.target_loteo_id ?? null,
            ...(mode === 'blueprint'
              ? { blueprint_coordinates: polygonPixels }
              : { panorama_coordinates: polygonPixels }),
          } : a
        ));
        setSelectedId(res.id);
        onAfterCreate?.();
      }
    } catch (err) {
      if (err?.message?.includes('401')) { onAuthError?.(); return; }
      alert('Error de conexión al crear el POI.');
    } finally {
      setIsCreatingPoi(false);
    }
  };

  const handleSavePoi = async (poiId, form, polygonPixels) => {
    if (!form.title.trim()) { alert('El título es requerido.'); return; }
    if (!poiId) { alert('Este POI no tiene UUID asignado.'); return; }

    setIsSavingPoi(true);
    try {
      const hasCoords = polygonPixels?.length >= 3;
      const coordFn = mode === 'blueprint' ? updatePoiBlueprintCoordinates : updatePoiCoordinates;

      const requests = [
        updatePoi(token, poiId, {
          title: form.title.trim(),
          icon_type: form.icon_type.trim() || null,
          description: form.description.trim() || null,
          link_url: form.link_url.trim() || null,
          color: form.color || '#14b8a6',
          target_loteo_id: form.target_loteo_id || null,
        }),
        ...(hasCoords ? [coordFn(token, poiId, polygonPixels)] : []),
      ];

      const [metaRes] = await Promise.all(requests);

      if (metaRes?.id) {
        setAnnotations(prev => prev.map(a =>
          (a.uuid === poiId || a.id === poiId) ? {
            ...a,
            tooltip: metaRes.title,
            title: metaRes.title,
            icon_type: metaRes.icon_type,
            description: metaRes.description,
            link_url: metaRes.link_url,
            color: metaRes.color,
            target_loteo_id: metaRes.target_loteo_id ?? null,
            ...(hasCoords
              ? mode === 'blueprint'
                ? { blueprint_coordinates: polygonPixels }
                : { panorama_coordinates: polygonPixels }
              : {}),
          } : a
        ));
      }

      alert('¡POI guardado correctamente!');
    } catch (err) {
      if (err?.message?.includes('401')) { onAuthError?.(); return; }
      alert('Error al guardar el POI.');
    } finally {
      setIsSavingPoi(false);
    }
  };

  const handleDeletePoi = async (poiId) => {
    try {
      if (poiId) await deletePoi(token, poiId);
      setAnnotations(prev => prev.filter(a => a.uuid !== poiId && a.id !== poiId && a.id !== selectedId));
      setSelectedId(null);
    } catch {
      alert('Error de conexión al eliminar el POI.');
    }
  };

  return {
    isCreatingPoi,
    isSavingPoi,
    handleCreatePoi,
    handleSavePoi,
    handleDeletePoi,
  };
}
