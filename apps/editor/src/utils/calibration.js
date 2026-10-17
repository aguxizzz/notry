export const BLUEPRINT_CLOSE_THRESHOLD = 0.025;
export const PANORAMA_CLOSE_THRESHOLD = 12;
// Tope duro de pares plano↔panorama: con 4 la proyección ya es precisa, y
// más puntos agregados sueltos hacen más mal que bien. Para reemplazar uno,
// se borra primero.
export const MAX_CALIBRATION_PAIRS = 4;

// Los puntos que vienen del backend o de un borrador viejo pueden no tener
// `_id` (lo usan los markers para identificar el par).
export const withPairIds = points => (points ?? []).map(p => (p._id ? p : { ...p, _id: crypto.randomUUID() }));

/**
 * Fase de juntar puntos en el plano. El tamaño del lote es lo que falta
 * para llegar a 4 pares (fijo durante toda la fase, porque los pares solo
 * cambian al emparejar). Devuelve null si ya hay 4 pares.
 */
export function queueBlueprintPoint(pairs, pending, point) {
  if (pairs.length >= MAX_CALIBRATION_PAIRS) return null;
  const nextPending = [...pending, point];
  return { pending: nextPending, batchFull: nextPending.length >= MAX_CALIBRATION_PAIRS - pairs.length };
}

/**
 * Fase de emparejar en el panorama: el click se empareja con el punto del
 * plano más viejo todavía en cola, en el mismo orden en que se pusieron.
 * Devuelve null si no hay nada en cola.
 */
export function matchPanoramaPoint(pairs, pending, point, id) {
  if (pending.length === 0) return null;
  const pair = { _id: id, blueprint: pending[0], panorama: point };
  const nextPairs = [...pairs, pair];
  const nextPending = pending.slice(1);
  return {
    pairs: nextPairs,
    pending: nextPending,
    batchDone: nextPending.length === 0,
    calibrationComplete: nextPending.length === 0 && nextPairs.length === MAX_CALIBRATION_PAIRS,
  };
}

/**
 * Mueve un lado (plano o panorama) de un par. El plano está normalizado a
 * [0, 1] y se acota; el panorama está en pixeles de textura y NO se acota.
 */
export function moveCalibrationPoint(pairs, pairId, view, [x, y]) {
  const point = view === 'blueprint' ? [clamp01(x), clamp01(y)] : [x, y];
  return pairs.map(p => (p._id === pairId ? { ...p, [view]: point } : p));
}

const clamp01 = v => Math.max(0, Math.min(1, v));

export function isCalibrationPairTooClose(existingPair, blueprintPoint, panoramaPoint) {
  if (!existingPair?.blueprint || !existingPair?.panorama) return false;

  const blueprintDistance = Math.hypot(
    existingPair.blueprint[0] - blueprintPoint[0],
    existingPair.blueprint[1] - blueprintPoint[1],
  );
  const panoramaDistance = Math.hypot(
    existingPair.panorama[0] - panoramaPoint[0],
    existingPair.panorama[1] - panoramaPoint[1],
  );

  return blueprintDistance < BLUEPRINT_CLOSE_THRESHOLD
    && panoramaDistance < PANORAMA_CLOSE_THRESHOLD;
}
