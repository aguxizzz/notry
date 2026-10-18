import { useState, useEffect } from 'react';

const scalePoints = (points, scaleX, scaleY) => Array.isArray(points)
  ? points.map((point) => Array.isArray(point) && point.length >= 2
    ? [point[0] * scaleX, point[1] * scaleY, ...point.slice(2)]
    : point)
  : points;

export function rescaleDraft(draft, currentDimensions) {
  const previous = draft.panoramaDimensions;
  if (!previous?.width || !previous?.height || !currentDimensions?.width || !currentDimensions?.height) {
    return draft;
  }
  if (previous.width === currentDimensions.width && previous.height === currentDimensions.height) {
    return draft;
  }

  const scaleX = currentDimensions.width / previous.width;
  const scaleY = currentDimensions.height / previous.height;
  const annotations = (draft.annotations ?? []).map((annotation) => {
    const next = { ...annotation };
    if (annotation.panorama_coordinates) {
      next.panorama_coordinates = scalePoints(annotation.panorama_coordinates, scaleX, scaleY);
    }
    // Borradores viejos guardaban también polygonPixels (hoy es derivado).
    if (annotation.polygonPixels && annotation.panorama_coordinates) {
      next.polygonPixels = scalePoints(annotation.polygonPixels, scaleX, scaleY);
    }
    if (annotation.panorama_anchor) {
      next.panorama_anchor = scalePoints([annotation.panorama_anchor], scaleX, scaleY)[0];
    }
    if (annotation.polylinePixels) {
      next.polylinePixels = scalePoints(annotation.polylinePixels, scaleX, scaleY);
    }
    if (annotation.position && ('textureX' in annotation.position || 'textureY' in annotation.position)) {
      next.position = {
        ...annotation.position,
        ...('textureX' in annotation.position ? { textureX: annotation.position.textureX * scaleX } : {}),
        ...('textureY' in annotation.position ? { textureY: annotation.position.textureY * scaleY } : {}),
      };
    }
    return next;
  });
  const calibrationPoints = (draft.calibrationPoints ?? []).map((point) => ({
    ...point,
    ...(point.panorama ? { panorama: scalePoints([point.panorama], scaleX, scaleY)[0] } : {}),
  }));

  // Las shapes de Render están en pixeles del panorama (contorno, eje y el
  // ancho de la Ruta). La geo-calibración es plano ↔ lat/lng: no se toca.
  const scaleShape = shape => ({
    ...shape,
    points: scalePoints(shape.points, scaleX, scaleY),
    ...(shape.axis ? { axis: scalePoints(shape.axis, scaleX, scaleY) } : {}),
    ...(typeof shape.width === 'number' ? { width: shape.width * scaleX } : {}),
  });
  const renderSurfaces = draft.renderSurfaces
    ? {
      ...draft.renderSurfaces,
      manzanas: (draft.renderSurfaces.manzanas ?? []).map(scaleShape),
      calles: (draft.renderSurfaces.calles ?? []).map(scaleShape),
    }
    : draft.renderSurfaces;

  return { ...draft, annotations, calibrationPoints, renderSurfaces, panoramaDimensions: currentDimensions };
}

const draftHasContent = draft => (
  draft.annotations?.length > 0
  || draft.calibrationPoints?.length > 0
  || draft.geoCalibrationPoints?.length > 0
  || draft.renderSurfaces?.manzanas?.length > 0
  || draft.renderSurfaces?.calles?.length > 0
);

/**
 * Borrador local (localStorage) de todo lo editable, para no perder trabajo
 * si se cierra la pestaña. `state` es { annotations, calibrationPoints,
 * geoCalibrationPoints, renderSurfaces }; se guarda 2s después del último
 * cambio, solo si `isDirty` (detectChanges, igual que el indicador).
 */
export function useDraft({ loteoId, state, isDirty, panoramaDimensions }) {
  const [pendingDraft, setPendingDraft] = useState(null);

  const draftKey = loteoId ? `notry_draft_${loteoId}` : null;

  const saveDraft = () => {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify({
      version: 3,
      loteoId,
      savedAt: new Date().toISOString(),
      annotations: state.annotations,
      calibrationPoints: state.calibrationPoints ?? [],
      geoCalibrationPoints: state.geoCalibrationPoints ?? [],
      renderSurfaces: state.renderSurfaces,
      panoramaDimensions,
    }));
  };

  const clearDraft = () => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
    setPendingDraft(null);
  };

  const loadDraft = (id, currentDimensions = panoramaDimensions) => {
    if (!id) return;
    const key = `notry_draft_${id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draftHasContent(draft)) {
        setPendingDraft(rescaleDraft(draft, currentDimensions));
      }
    } catch {
      localStorage.removeItem(key);
    }
  };

  useEffect(() => {
    if (!loteoId || !isDirty) return;
    const timer = setTimeout(saveDraft, 2000);
    return () => clearTimeout(timer);
  }, [state.annotations, state.calibrationPoints, state.geoCalibrationPoints, state.renderSurfaces, isDirty, loteoId, panoramaDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pendingDraft, loadDraft, clearDraft };
}
