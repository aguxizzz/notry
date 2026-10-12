const STORAGE_KEY = 'notry_lote_labels_prototype';

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStored(map) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage no disponible (modo privado, cuota, etc): el prototipo
    // sigue funcionando, solo no persiste entre navegaciones de la sesión.
  }
}

/**
 * Prototipo client-only: asigna un código corto ("L1", "L2"...) a cada lote
 * y lo persiste en sessionStorage para que se mantenga estable durante la
 * sesión del visor. No pega al backend — se reemplaza por un campo real
 * (ej. `ann.code`) una vez validado visualmente.
 */
export function getLoteLabels(annotations) {
  const stored = loadStored();
  let changed = false;
  let nextIndex = Object.keys(stored).length + 1;
  const labels = new Map();

  for (const ann of annotations) {
    if (ann.type !== 'polygon') continue;
    const id = ann.uuid ?? ann.id;
    if (!id) continue;

    if (!stored[id]) {
      stored[id] = `L${nextIndex}`;
      nextIndex += 1;
      changed = true;
    }
    labels.set(id, stored[id]);
  }

  if (changed) saveStored(stored);
  return labels;
}
