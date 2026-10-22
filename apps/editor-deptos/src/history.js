// Deshacer/rehacer, sin saber nada del edificio.
//
// Un paso es una función que aplica un cambio y devuelve el paso inverso (o null si ya no
// había nada que cambiar). Deshacer ejecuta el paso y guarda su inverso para rehacer, y
// viceversa: así cada lado se arma solo con lo que había en el momento de ejecutarse.
export function createHistory({ limit = 100, mergeMs = 1000, onChange = () => {} } = {}) {
  let undoStack = [];
  let redoStack = [];
  let last = null; // { key, at } del último paso registrado, para juntar cambios continuos

  // Pasos seguidos con la misma `mergeKey` (un slider arrastrado) cuentan como uno solo: se
  // queda el inverso del primero, que vuelve al valor de antes de empezar.
  function record(inverse, mergeKey) {
    if (!inverse) return;
    const now = Date.now();
    if (mergeKey && last?.key === mergeKey && now - last.at < mergeMs) {
      last.at = now;
    } else {
      undoStack.push(inverse);
      if (undoStack.length > limit) undoStack.shift();
      last = mergeKey ? { key: mergeKey, at: now } : null;
    }
    redoStack = [];
    onChange();
  }

  function step(from, to) {
    const op = from.pop();
    if (!op) return false;
    const inverse = op();
    if (inverse) to.push(inverse);
    last = null;
    onChange();
    return true;
  }

  return {
    record,
    undo: () => step(undoStack, redoStack),
    redo: () => step(redoStack, undoStack),
    clear() {
      undoStack = [];
      redoStack = [];
      last = null;
      onChange();
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
