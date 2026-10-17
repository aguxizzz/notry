import { applyProjector } from './panoramaProjection.js';
import { withShapeCoords } from './annotationModel.js';

// Each vertex is now placed at its true spherical position (see
// panoramaProjection.js), but PSV's polygonPixel marker still draws a plain
// straight line between consecutive texture-pixel vertices — and a straight
// ground-plane edge still traces a *curved* path once wrapped onto the
// sphere, especially over a wide field of view. Subdividing the edge in
// blueprint space first — then projecting each sample point — makes the
// polyline hug that true curve instead of chording across it.
const MIN_EDGE_SEGMENT = 0.02; // in normalized blueprint units
const MAX_EDGE_SEGMENTS = 32;

function subdivideEdges(coordinates) {
  const out = [];
  for (let i = 0; i < coordinates.length; i++) {
    const [x0, y0] = coordinates[i];
    const [x1, y1] = coordinates[(i + 1) % coordinates.length];
    const edgeLength = Math.hypot(x1 - x0, y1 - y0);
    const segments = Math.min(
      MAX_EDGE_SEGMENTS,
      Math.max(1, Math.ceil(edgeLength / MIN_EDGE_SEGMENT))
    );
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return out;
}

export function projectPolygon(coordinates, projector) {
  if (!projector || !Array.isArray(coordinates) || coordinates.length < 3) return null;
  const projected = coordinates.map(point => applyProjector(projector, point));
  return projected.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    ? projected
    : null;
}

// Same as projectPolygon, but densifies each edge first so the resulting
// polyline hugs the true (curved) projection of a straight ground-plane edge
// instead of one long straight chord between corners. Use this only for
// display-only geometry (e.g. the blueprint ghost preview) — the extra points
// must never leak into `panorama_coordinates`, since that array is also the
// authoritative, positionally-indexed vertex list for corner-drag editing and
// backend persistence (see useDisplayAnnotations.js / EditorViewer.jsx).
export function projectPolygonDense(coordinates, projector) {
  if (!projector || !Array.isArray(coordinates) || coordinates.length < 3) return null;
  const projected = subdivideEdges(coordinates).map(point => applyProjector(projector, point));
  return projected.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    ? projected
    : null;
}

// Escribe `panorama_coordinates`; la geometría que se ve en pantalla se
// deriva de ahí (ver toModeAnnotation en annotationModel.js).
export function projectLotAnnotations(annotations, projector, { overwrite = false } = {}) {
  let count = 0;
  const nextAnnotations = annotations.map(annotation => {
    const canProject = annotation.type === 'polygon'
      && !annotation.pending
      && annotation.blueprint_coordinates?.length >= 3
      && (overwrite || !annotation.panorama_coordinates?.length);
    if (!canProject) return annotation;

    const projected = projectPolygon(annotation.blueprint_coordinates, projector);
    if (!projected) return annotation;
    count += 1;
    return withShapeCoords(annotation, 'panorama', projected);
  });

  return { annotations: nextAnnotations, count };
}

/**
 * "Quitar de esta vista": vacía la geometría de los lotes en una vista
 * (panorama por defecto) y deja la de la otra. El lote sigue existiendo.
 */
export function unimportLotAnnotations(annotations, ids, mode = 'panorama') {
  const targetIds = ids instanceof Set ? ids : new Set(ids);
  return annotations.map(annotation => (
    targetIds.has(annotation.id) ? withShapeCoords(annotation, mode, []) : annotation
  ));
}
