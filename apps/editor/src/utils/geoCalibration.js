// Calibración geográfica (plano ↔ lat/lng): pares `{ _id, blueprint: [nx, ny],
// geo: [lat, lng] }`. Con 4+ pares se ajusta una homografía plano → (lng, lat)
// y se "hornean" los geo_coordinates de cada lote — no se recalcula solo, se
// corre a mano con "Actualizar polígonos satelitales".
import { applyHomography, computeHomography, isHomographyValid } from './homography.js';
import { MARKER_ID, geoCalibPointId } from './markerIds.js';
import { toModeAnnotation } from './annotationModel.js';

export const MIN_GEO_PAIRS = 4;

/**
 * Lotes con geo_coordinates recalculados desde su blueprint_coordinates.
 * Devuelve null si faltan pares o la homografía sale inválida.
 */
export function projectGeoPolygons(annotations, geoPoints) {
  if (geoPoints.length < MIN_GEO_PAIRS) return null;
  // La homografía trabaja en (x, y) = (lng, lat); los pares guardan [lat, lng].
  const H = computeHomography(geoPoints.map(p => ({ src: p.blueprint, dst: [p.geo[1], p.geo[0]] })));
  if (!isHomographyValid(H)) return null;
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
