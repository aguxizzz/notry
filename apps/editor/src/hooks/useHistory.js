import { useCallback, useEffect, useRef, useState } from 'react';

export function useHistory({ annotations, setAnnotations, calibrationPoints, setCalibrationPoints }) {
  // Each history entry is a composite snapshot: { annotations, calibrationPoints }
  const past = useRef([]);
  const future = useRef([]);
  const annotationsRef = useRef(annotations);
  const calibrationRef = useRef(calibrationPoints);

  useEffect(() => {
    annotationsRef.current = annotations;
    calibrationRef.current = calibrationPoints;
  }, [annotations, calibrationPoints]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Accepts the annotations snapshot (as before) and composes it with the
  // current calibrationPoints. Existing call sites don't change: their operations
  // don't touch calibration, so the current calibrationPoints is the correct
  // pre-change value to snapshot.
  const pushHistory = useCallback((annotationsSnapshot) => {
    past.current = [...past.current, {
      annotations: annotationsSnapshot,
      calibrationPoints: calibrationRef.current,
    }];
    future.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const previous = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [{
      annotations: annotationsRef.current,
      calibrationPoints: calibrationRef.current,
    }, ...future.current];
    setAnnotations(previous.annotations);
    setCalibrationPoints(previous.calibrationPoints);
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
  }, [setAnnotations, setCalibrationPoints]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, {
      annotations: annotationsRef.current,
      calibrationPoints: calibrationRef.current,
    }];
    setAnnotations(next.annotations);
    setCalibrationPoints(next.calibrationPoints);
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
  }, [setAnnotations, setCalibrationPoints]);

  const removeAnnotationFromHistory = useCallback((...annotationIds) => {
    const targetIds = new Set(annotationIds.filter(Boolean));
    if (targetIds.size === 0) return;

    const withoutDeletedAnnotation = entry => ({
      ...entry,
      annotations: entry.annotations.filter(annotation => (
        !targetIds.has(annotation.id) && !targetIds.has(annotation.uuid)
      )),
    });

    past.current = past.current.map(withoutDeletedAnnotation);
    future.current = future.current.map(withoutDeletedAnnotation);
  }, []);

  return { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory };
}
