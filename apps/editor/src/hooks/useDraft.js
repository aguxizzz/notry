import { useState, useEffect } from 'react';

const scalePoints = (points, scaleX, scaleY) => Array.isArray(points)
  ? points.map((point) => Array.isArray(point) && point.length >= 2
    ? [point[0] * scaleX, point[1] * scaleY, ...point.slice(2)]
    : point)
  : points;

function rescaleDraft(draft, currentDimensions) {
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
    if (annotation.polygonPixels && annotation.panorama_coordinates) {
      next.polygonPixels = scalePoints(annotation.polygonPixels, scaleX, scaleY);
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

  return { ...draft, annotations, calibrationPoints, panoramaDimensions: currentDimensions };
}

export function useDraft({ annotations, loteoId, savedAnnotationsRef, calibrationPoints, savedCalibrationRef, panoramaDimensions }) {
  const [pendingDraft, setPendingDraft] = useState(null);

  const draftKey = loteoId ? `notry_draft_${loteoId}` : null;

  const saveDraft = (currentAnnotations, currentCalibration) => {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify({
      version: 2,
      loteoId,
      savedAt: new Date().toISOString(),
      annotations: currentAnnotations,
      calibrationPoints: currentCalibration ?? [],
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
      if (draft.annotations?.length > 0 || draft.calibrationPoints?.length > 0) {
        setPendingDraft(rescaleDraft(draft, currentDimensions));
      }
    } catch {
      localStorage.removeItem(key);
    }
  };

  // Auto-save debounced (2s) — only when annotations or calibration differ from server state
  useEffect(() => {
    if (!loteoId) return;
    if (annotations.length === 0 && (calibrationPoints ?? []).length === 0) return;
    const savedAnns = savedAnnotationsRef?.current ?? [];
    const savedCal = savedCalibrationRef?.current ?? [];
    const annsChanged = JSON.stringify(annotations) !== JSON.stringify(savedAnns);
    const calChanged = JSON.stringify(calibrationPoints ?? []) !== JSON.stringify(savedCal);
    if (!annsChanged && !calChanged) return;
    const timer = setTimeout(() => saveDraft(annotations, calibrationPoints), 2000);
    return () => clearTimeout(timer);
  }, [annotations, calibrationPoints, loteoId, panoramaDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pendingDraft, loadDraft, clearDraft };
}
