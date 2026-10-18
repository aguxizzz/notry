import { useCallback, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import {
  EMPTY_HISTORY, pushSnapshot, redoSnapshot, undoSnapshot, withoutAnnotations,
} from '../utils/historyStack';

const currentOf = slices => Object.fromEntries(
  Object.entries(slices).map(([key, [value]]) => [key, value])
);

const applyTo = (slices, snapshot) => {
  for (const [key, [, setValue]] of Object.entries(slices)) {
    if (key in snapshot) setValue(snapshot[key]);
  }
};

/**
 * Undo/redo de todo lo editable. `slices` es { clave: [valor, setter] }; cada
 * entrada del historial guarda un snapshot con todas las claves, así un
 * cambio en cualquier slice se deshace sin tocar los demás.
 *
 * `pushHistory(annotationsSnapshot?)` guarda el estado ACTUAL de todos los
 * slices; opcionalmente se le pasa el de `annotations` de antes de un
 * arrastre (cuando lo actual ya es el resultado del gesto).
 */
export function useHistory({ slices }) {
  const slicesRef = useLatest(slices);
  const history = useRef(EMPTY_HISTORY);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const setHistory = useCallback((next) => {
    history.current = next;
    setCanUndo(next.past.length > 0);
    setCanRedo(next.future.length > 0);
  }, []);

  const pushHistory = useCallback((annotationsSnapshot) => {
    const snapshot = currentOf(slicesRef.current);
    if (annotationsSnapshot !== undefined) snapshot.annotations = annotationsSnapshot;
    setHistory(pushSnapshot(history.current, snapshot));
  }, [slicesRef, setHistory]);

  const step = useCallback((fn) => {
    const result = fn(history.current, currentOf(slicesRef.current));
    if (!result) return;
    setHistory(result.history);
    applyTo(slicesRef.current, result.restored);
  }, [slicesRef, setHistory]);

  const undo = useCallback(() => step(undoSnapshot), [step]);
  const redo = useCallback(() => step(redoSnapshot), [step]);

  const removeAnnotationFromHistory = useCallback((...annotationIds) => {
    history.current = withoutAnnotations(history.current, annotationIds);
  }, []);

  return { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory };
}
