// Modo "Ruta" del pincel de calles (ver EditorViewer.jsx) — el usuario traza
// el eje central de la calle con unos pocos clicks y esto genera el contorno
// (buffer geométrico) con ancho constante, en el mismo formato de puntos que
// ya usan las shapes de manzana/calle dibujadas a mano (sin persistencia).

import polygonClipping from 'polygon-clipping';
import { buildStreetRibbon } from '@map3d/streetRibbon.js';
import { unprojectPoint } from './panoramaProjection.js';
import { projectPolygonDense } from './projection.js';

// The ribbon (axis → outline with rounded corners) and the union with holes
// live in the visor, whose 3D map draws the satellite calles too.
export { buildStreetRibbon, unionStreetAreas } from '@map3d/streetRibbon.js';

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// Conectar rutas: si el primer click de una Ruta nueva cae cerca del inicio o
// el final del eje de una Ruta ya trazada, se las mergea en un solo eje
// continuo (el punto de unión queda como vértice interior, así el fillet lo
// curva solo) en vez de dejar dos ribbons independientes con una costura.
export const AXIS_SNAP_THRESHOLD = 20; // px de textura del panorama

// `end` es 'start'/'end' en las puntas del eje (se sigue mergeando en un solo
// axis, ver mergeStreetAxis) o 'interior' en un vértice del medio (ahí no se
// puede mergear — salen 3 direcciones de un mismo punto — así que la nueva
// Ruta queda como shape independiente que arranca exacto en ese vértice; el
// contorno se ve continuo porque los dos ribbons se unen con una boolean
// union al renderizar, ver unionStreetPolygons).
// `threshold` va en las unidades de los puntos: px de textura en el panorama,
// fracción del plano en el modo satélite (geoSurfaces.js).
export function findAxisEndpointSnap(point, calleShapes, excludeId = null, threshold = AXIS_SNAP_THRESHOLD) {
  let best = null;
  let bestDist = threshold;
  for (const shape of calleShapes) {
    if (!shape.axis || shape.axis.length < 2 || shape.id === excludeId) continue;
    shape.axis.forEach((pt, i) => {
      const end = i === 0 ? 'start' : i === shape.axis.length - 1 ? 'end' : 'interior';
      const d = distance(pt, point);
      if (d < bestDist) {
        bestDist = d;
        best = { shapeId: shape.id, end, vertexIndex: i, point: pt };
      }
    });
  }
  return best;
}

// `newPoints[0]` es el click que generó el snap (cerca de `existingAxis` en
// el extremo `end`, pero no exactamente encima) — se descarta y se usa el
// punto exacto del eje existente para no dejar un micro-segmento en la unión.
export function mergeStreetAxis(existingAxis, end, newPoints) {
  const rest = newPoints.slice(1);
  if (end === 'end') return [...existingAxis, ...rest];
  return [...rest.slice().reverse(), ...existingAxis];
}

export function pointInPolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// La unión visual (unionStreetPolygons) funde varias Rutas en un solo
// contorno para el fill/stroke, así que el id del marker pintado ya no
// identifica una shape puntual — para saber qué Ruta se clickeó hay que
// testear el punto contra el ribbon (shape.points) de cada shape con axis.
export function findStreetShapeAtPoint(point, calleShapes) {
  for (const shape of calleShapes) {
    if (shape.axis && shape.points && pointInPolygon(point, shape.points)) {
      return shape.id;
    }
  }
  return null;
}

// Une los polígonos (contornos ya curvados, `points` post buildCurvedPolygon)
// de las Rutas que se tocan en un vértice interior (ver findAxisEndpointSnap)
// en un solo contorno por cada grupo conectado, para que el borde de la calle
// no se corte en la unión. `polygon-clipping` espera anillos GeoJSON (cerrados,
// primer punto == último); nuestros polígonos vienen abiertos.
// Devuelve un array de anillos (uno por grupo conectado, sin duplicar el
// punto de cierre) listo para pasar como `polygonPixels`. Los agujeros que
// pueda generar una unión (poco común, p. ej. un loop cerrado de calles) se
// descartan — es una herramienta de prueba visual, no necesita ser exacta ahí.
export function unionStreetPolygons(polygonsPoints) {
  const closed = polygonsPoints
    .filter(pts => pts && pts.length >= 3)
    .map(pts => [[...pts.map(([x, y]) => [x, y]), pts[0]]]);
  if (!closed.length) return [];
  if (closed.length === 1) return [polygonsPoints[0]];
  const result = polygonClipping.union(...closed);
  return result.map(polygon => {
    const outer = polygon[0];
    return outer.slice(0, -1);
  });
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

// Experimental: same result as buildStreetRibbon, but geometrically correct
// on the sphere instead of hand-drawn-approximate. The axis is clicked
// directly on the panorama (texture pixels) same as always — but instead of
// offsetting/filleting in that space (where a straight street doesn't
// actually look straight once wrapped on the sphere, "plastilina"-style,
// see panoramaProjection.js), each axis point is unprojected back to
// blueprint space first, where the ground really is a flat Euclidean plane.
// The ribbon is built there, then re-projected to the panorama with edge
// subdivision (projectPolygonDense) so it hugs the true curve.
//
// `widthPx` is in panorama texture pixels (what the width slider shows); it's
// converted to a SINGLE blueprint-unit width using `projector.widthScale` —
// one fixed factor for the whole panorama (see computeProjector), not a
// per-point or per-route scale. The true local scale varies wildly (>10x)
// between a point near the camera and one near the ground-plane horizon,
// which is physically correct but made a single street look inconsistently
// wide along its own length, and made two streets meeting at the same point
// disagree on the width right at the seam. A single fixed factor trades
// perfect per-point perspective accuracy for that consistency.
export function buildProjectedStreetRibbon(texturePoints, widthPx, projector) {
  if (!projector || !texturePoints || texturePoints.length < 2 || !widthPx) return null;

  // Un punto sobre el horizonte del piso no tiene vuelta al plano (NaN).
  const blueprintAxis = texturePoints.map(p => unprojectPoint(projector, p));
  if (blueprintAxis.some(p => !p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;

  const textureLength = pathLength(texturePoints);
  const blueprintLength = pathLength(blueprintAxis);
  if (textureLength < 1e-6 || blueprintLength < 1e-9) return null;
  const scale = projector.widthScale ?? (blueprintLength / textureLength);

  const ribbonBlueprint = buildStreetRibbon(blueprintAxis, widthPx * scale);
  if (!ribbonBlueprint.length) return null;

  return projectPolygonDense(ribbonBlueprint, projector);
}
