// Modo Render: manzanas y calles dibujadas sobre el panorama. Se persisten
// como `render_surfaces` (JSONB en loteos) en el "Guardar todo".
//
// Funciones puras sobre `{ manzanas, calles }` — useRenderSurfaces es quien
// tiene el estado y las conecta con el historial.
//
// Shapes:
//   manzana: { id, points }                       — polígono a mano
//   calle:   { id, points, axis, width }          — "Ruta": eje + ancho; points
//                                                   es el contorno generado
//   calle vieja (sin axis): { id, points }        — dibujada a mano, se respeta
import { buildProjectedStreetRibbon, buildStreetRibbon, findAxisEndpointSnap, mergeStreetAxis } from './streetPath.js';

export const RENDER_KINDS = ['manzana', 'calle'];
export const DEFAULT_LAYERS_VISIBLE = { lotes: true, manzanas: true, calles: true };

// Shape estable (nunca null) para que el diff contra lo guardado funcione
// igual en loteos que nunca tocaron el modo Render.
export const DEFAULT_RENDER_SURFACES = {
  manzanas: [],
  calles: [],
  colorMode: 'light',
  manzanaOpacity: 1,
  layersVisible: DEFAULT_LAYERS_VISIBLE,
};

export function normalizeRenderSurfaces(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_RENDER_SURFACES;
  return {
    manzanas: raw.manzanas ?? [],
    calles: raw.calles ?? [],
    colorMode: raw.colorMode ?? 'light',
    manzanaOpacity: raw.manzanaOpacity ?? 1,
    layersVisible: raw.layersVisible ?? DEFAULT_LAYERS_VISIBLE,
  };
}

/**
 * `layersVisible` es un filtro puramente visual: se persiste para recordar
 * qué capas se veían, pero cambiarlo no cuenta como "cambio sin guardar".
 */
export function surfacesForDirtyCheck(surfaces) {
  const { layersVisible: _layersVisible, ...rest } = surfaces ?? {};
  return rest;
}

export const minPointsFor = kind => (kind === 'calle' ? 2 : 3);

/**
 * Contorno de una Ruta. Con calibración, el offset y el redondeo de esquinas
 * se hacen en el plano (donde el piso es plano de verdad) y se reproyecta;
 * sin calibración, o si el ida y vuelta da puntos inválidos, se hace directo
 * en pixeles del panorama.
 */
export function streetRibbon(axis, width, homography) {
  return buildProjectedStreetRibbon(axis, width, homography) ?? buildStreetRibbon(axis, width);
}

/**
 * Cierra el trazo en curso y lo agrega a las superficies. Devuelve las
 * superficies nuevas, o null si el trazo no alcanza para una forma.
 *
 * Calle: si el primer click cae cerca de la punta del eje de otra Ruta, se
 * mergea en un solo eje continuo (así el contorno sale de una pieza, sin
 * costura). Si cae en un vértice interior (de ahí saldrían 3 direcciones),
 * queda como Ruta aparte pero arrancando exacto en ese vértice — al
 * renderizar, los contornos se unen con boolean union.
 */
export function addDrawnShape(surfaces, { kind, drawingPts, streetWidth, homography, id }) {
  if (!RENDER_KINDS.includes(kind) || drawingPts.length < minPointsFor(kind)) return null;

  if (kind === 'manzana') {
    return { ...surfaces, manzanas: [...surfaces.manzanas, { id, points: drawingPts }] };
  }

  const snap = findAxisEndpointSnap(drawingPts[0], surfaces.calles);
  if (snap && snap.end !== 'interior') {
    const target = surfaces.calles.find(s => s.id === snap.shapeId);
    const axis = mergeStreetAxis(target.axis, snap.end, drawingPts);
    const points = streetRibbon(axis, target.width, homography);
    if (points.length) {
      return {
        ...surfaces,
        calles: surfaces.calles.map(s => (s.id === target.id ? { ...s, axis, points } : s)),
      };
    }
  }

  const axis = snap?.end === 'interior' ? [snap.point, ...drawingPts.slice(1)] : drawingPts;
  const points = streetRibbon(axis, streetWidth, homography);
  if (!points.length) return null;
  return { ...surfaces, calles: [...surfaces.calles, { id, points, axis, width: streetWidth }] };
}

function updateStreet(calles, shapeId, patch, homography) {
  return calles.map(shape => {
    if (shape.id !== shapeId || !shape.axis) return shape;
    const next = { ...shape, ...patch };
    return { ...next, points: streetRibbon(next.axis, next.width, homography) };
  });
}

export const withStreetAxis = (calles, shapeId, axis, homography) => updateStreet(calles, shapeId, { axis }, homography);
export const withStreetWidth = (calles, shapeId, width, homography) => updateStreet(calles, shapeId, { width }, homography);

export const hasAnyShape = surfaces => surfaces.manzanas.length > 0 || surfaces.calles.length > 0;
export const hasStreetPaths = calles => calles.some(s => s.axis);
