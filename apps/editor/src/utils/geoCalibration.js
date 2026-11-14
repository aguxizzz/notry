// Calibración geográfica (plano ↔ lat/lng): pares `{ _id, blueprint: [nx, ny],
// geo: [lat, lng] }`. Con 4+ pares se ajusta una homografía plano → (lng, lat)
// y se "hornean" los geo_coordinates de cada lote — no se recalcula solo, se
// corre a mano con "Actualizar polígonos satelitales".
import { makeProjection } from '@map3d/ground.js';
import { applyHomography, computeHomography, isHomographyValid } from './homography.js';
import { MARKER_ID, geoCalibPointId } from './markerIds.js';
import { toModeAnnotation } from './annotationModel.js';

export const MIN_GEO_PAIRS = 4;

/**
 * Homografía plano [0,1]² → (lng, lat) de los pares, o null si faltan pares o
 * sale inválida. La usan el horneado de lotes y el plano superpuesto del mapa.
 */
export function geoHomography(geoPoints) {
  if (geoPoints.length < MIN_GEO_PAIRS) return null;
  // La homografía trabaja en (x, y) = (lng, lat); los pares guardan [lat, lng].
  const H = computeHomography(geoPoints.map(p => ({ src: p.blueprint, dst: [p.geo[1], p.geo[0]] })));
  return isHomographyValid(H) ? H : null;
}

/**
 * Pares con el lado del mapa (geo) movido por un gesto de "Ajustar" sobre el
 * plano superpuesto. El plano no tiene posición propia: se mueve moviendo los
 * pares, así sigue habiendo una sola calibración. `gesture` es
 * { target, from, to } con from/to como { latitude, longitude } del suelo:
 *   - target.type 'move':   todos los pares se trasladan from → to.
 *   - target.type 'corner': escala + giro alrededor del centro del plano, lo
 *                           que haga falta para que `from` caiga en `to`.
 *   - target.type 'pin':    solo el par target.id se traslada (ajuste fino).
 * Las cuentas van en metros (plano local en el centro del plano), no en grados:
 * un giro en grados deformaría, porque un grado de lng mide menos que uno de lat.
 */
export function transformGeoPairs(pairs, { target, from, to }) {
  const H = geoHomography(pairs);
  if (!H) return pairs;
  const [clng, clat] = applyHomography(H, [0.5, 0.5]);
  const { toLocal, toGeo } = makeProjection(clat, clng);
  const f = toLocal(from.latitude, from.longitude);
  const t = toLocal(to.latitude, to.longitude);

  let fn;
  if (target.type === 'corner') {
    const r0 = Math.hypot(f.x, f.z);
    if (r0 < 1e-6) return pairs; // agarrado justo en el centro: no hay giro ni escala que medir
    const s = Math.hypot(t.x, t.z) / r0;
    const a = Math.atan2(t.z, t.x) - Math.atan2(f.z, f.x);
    const cos = Math.cos(a) * s;
    const sin = Math.sin(a) * s;
    fn = p => ({ x: p.x * cos - p.z * sin, z: p.x * sin + p.z * cos });
  } else {
    fn = p => ({ x: p.x + t.x - f.x, z: p.z + t.z - f.z });
  }

  return pairs.map((pair) => {
    if (target.type === 'pin' && pair._id !== target.id) return pair;
    const q = fn(toLocal(pair.geo[0], pair.geo[1]));
    const g = toGeo(q.x, q.z);
    return { ...pair, geo: [g.lat, g.lng] };
  });
}

/**
 * Lotes con geo_coordinates recalculados desde su blueprint_coordinates.
 * Devuelve null si faltan pares o la homografía sale inválida.
 */
export function projectGeoPolygons(annotations, geoPoints) {
  const H = geoHomography(geoPoints);
  if (!H) return null;
  return annotations.map(a => {
    if (a.type !== 'polygon' || !a.blueprint_coordinates?.length) return a;
    const geo_coordinates = a.blueprint_coordinates.map((pt) => {
      const [lng, lat] = applyHomography(H, pt);
      return [lat, lng];
    });
    return { ...a, geo_coordinates };
  });
}

const geoPointMarker = (id, [x, y], label, opacity) => ({
  id,
  type: 'calibration-point',
  position: { textureX: x, textureY: y },
  label,
  svgStyle: { fill: '#22c55e', stroke: '#fff', strokeWidth: '2', ...(opacity != null ? { opacity } : {}) },
});

/**
 * Lo que muestra el plano del overlay de geo-calibración: el contorno de los
 * lotes (de referencia) más los puntos de calibración y el pendiente.
 */
export function geoOverlayAnnotations(annotations, geoPoints, pendingPoint) {
  const lots = annotations
    .filter(a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3)
    .map(a => toModeAnnotation(a, 'blueprint'));
  const points = geoPoints.map((pair, i) => geoPointMarker(geoCalibPointId(pair._id), pair.blueprint, String(i + 1)));
  const pending = pendingPoint
    ? [geoPointMarker(MARKER_ID.geoCalibPending, pendingPoint, String(geoPoints.length + 1), 0.5)]
    : [];
  return [...lots, ...points, ...pending];
}
