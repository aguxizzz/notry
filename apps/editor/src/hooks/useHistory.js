import { useCallback, useEffect, useRef, useState } from 'react';

export function useHistory({
  annotations, setAnnotations, calibrationPoints, setCalibrationPoints,
  renderManzanaShapes, setRenderManzanaShapes, renderCalleShapes, setRenderCalleShapes,
}) {
  // Each history entry is a composite snapshot:
  // { annotations, calibrationPoints, renderManzanaShapes, renderCalleShapes }
  const past = useRef([]);
  const future = useRef([]);
  const annotationsRef = useRef(annotations);
  const calibrationRef = useRef(calibrationPoints);
  const renderManzanaRef = useRef(renderManzanaShapes);
  const renderCalleRef = useRef(renderCalleShapes);

  useEffect(() => {
    annotationsRef.current = annotations;
    calibrationRef.current = calibrationPoints;
    renderManzanaRef.current = renderManzanaShapes;
    renderCalleRef.current = renderCalleShapes;
  }, [annotations, calibrationPoints, renderManzanaShapes, renderCalleShapes]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Accepts the annotations snapshot (as before) and composes it with the
  // current calibrationPoints/render shapes. Existing call sites don't change:
  // an operation that doesn't touch calibration or render shapes leaves the
  // current ref value as the correct pre-change snapshot for that slice.
  const pushHistory = useCallback((annotationsSnapshot) => {
    past.current = [...past.current, {
      annotations: annotationsSnapshot,
      calibrationPoints: calibrationRef.current,
      renderManzanaShapes: renderManzanaRef.current,
      renderCalleShapes: renderCalleRef.current,
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
      renderManzanaShapes: renderManzanaRef.current,
      renderCalleShapes: renderCalleRef.current,
    }, ...future.current];
    setAnnotations(previous.annotations);
    setCalibrationPoints(previous.calibrationPoints);
    setRenderManzanaShapes(previous.renderManzanaShapes);
    setRenderCalleShapes(previous.renderCalleShapes);
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
  }, [setAnnotations, setCalibrationPoints, setRenderManzanaShapes, setRenderCalleShapes]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, {
      annotations: annotationsRef.current,
      calibrationPoints: calibrationRef.current,
      renderManzanaShapes: renderManzanaRef.current,
      renderCalleShapes: renderCalleRef.current,
    }];
    setAnnotations(next.annotations);
    setCalibrationPoints(next.calibrationPoints);
    setRenderManzanaShapes(next.renderManzanaShapes);
    setRenderCalleShapes(next.renderCalleShapes);
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
  }, [setAnnotations, setCalibrationPoints, setRenderManzanaShapes, setRenderCalleShapes]);

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
