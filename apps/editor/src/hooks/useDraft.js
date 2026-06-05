import { useState, useEffect } from 'react';

export function useDraft({ annotations, loteoId, savedAnnotationsRef, calibrationPoints, savedCalibrationRef }) {
  const [pendingDraft, setPendingDraft] = useState(null);

  const draftKey = loteoId ? `notry_draft_${loteoId}` : null;

  const saveDraft = (currentAnnotations, currentCalibration) => {
    if (!draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify({
      loteoId,
      savedAt: new Date().toISOString(),
      annotations: currentAnnotations,
      calibrationPoints: currentCalibration ?? [],
    }));
  };

  const clearDraft = () => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
    setPendingDraft(null);
  };

  const loadDraft = (id) => {
    if (!id) return;
    const key = `notry_draft_${id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.annotations?.length > 0 || draft.calibrationPoints?.length > 0) {
        setPendingDraft(draft);
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
  }, [annotations, calibrationPoints, loteoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pendingDraft, loadDraft, clearDraft };
}
