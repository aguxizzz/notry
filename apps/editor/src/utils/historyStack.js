// Pila de undo/redo, pura. Cada entrada es un snapshot compuesto
// ({ annotations, calibrationPoints, ... }) con una clave por "slice" del
// editor que entra al historial; useHistory tiene el estado y los setters.

export const EMPTY_HISTORY = { past: [], future: [] };

export const pushSnapshot = (history, snapshot) => ({
  past: [...history.past, snapshot],
  future: [],
});

// `current` es el estado de ahora, que pasa a la pila contraria. Devuelve
// null si no hay nada para deshacer/rehacer.
export function undoSnapshot(history, current) {
  if (history.past.length === 0) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    restored: history.past[history.past.length - 1],
  };
}

export function redoSnapshot(history, current) {
  if (history.future.length === 0) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    restored: history.future[0],
  };
}

// Un lote/POI eliminado en el servidor no tiene que volver con un undo.
export function withoutAnnotations(history, annotationIds) {
  const targetIds = new Set(annotationIds.filter(Boolean));
  if (targetIds.size === 0) return history;
  const strip = entry => ({
    ...entry,
    annotations: (entry.annotations ?? []).filter(annotation => (
      !targetIds.has(annotation.id) && !targetIds.has(annotation.uuid)
    )),
  });
  return { past: history.past.map(strip), future: history.future.map(strip) };
}
