// Lee `renderSurfaces` (manzanas/calles pintadas en el modo "Render" del
// editor, ver apps/editor/src/components/EditorViewer.jsx) y lo convierte en
// markers "poly" de PSV, en el mismo formato que usa annotationsToMarkers.
// Las coordenadas ya vienen en texture pixels del panorama (no necesitan
// homografía acá) — la conversión blueprint↔panorama ya se hizo en el editor
// al momento de dibujar.

import polygonClipping from 'polygon-clipping';

export const SURFACE_COLORS = {
  light: { manzana: '#eae4d3', calle: '#cfc9ba' },
  dark: { manzana: '#2a2823', calle: '#151412' },
};

// Copia de apps/editor/src/utils/streetPath.js unionStreetPolygons: une los
// contornos de calles "Ruta" (shape.axis) que se tocan en un vértice interior,
// para que el borde no se corte en la unión.
function unionStreetPolygons(polygonsPoints) {
  const closed = polygonsPoints
    .filter((pts) => pts && pts.length >= 3)
    .map((pts) => [[...pts.map(([x, y]) => [x, y]), pts[0]]]);
  if (!closed.length) return [];
  if (closed.length === 1) return [polygonsPoints[0]];
  const result = polygonClipping.union(...closed);
  return result.map((polygon) => polygon[0].slice(0, -1));
}

/**
 * @param {object|null} renderSurfaces - `{ manzanas, calles, colorMode, manzanaOpacity, layersVisible }`
 * @returns {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]}
 */
export function renderSurfacesToMarkers(renderSurfaces) {
  if (!renderSurfaces) return [];

  const manzanas = renderSurfaces.manzanas ?? [];
  const calles = renderSurfaces.calles ?? [];
  const layersVisible = renderSurfaces.layersVisible ?? { manzanas: true, calles: true };
  const manzanaOpacity = renderSurfaces.manzanaOpacity ?? 1;
  const colors = SURFACE_COLORS[renderSurfaces.colorMode] ?? SURFACE_COLORS.light;

  const markers = [];
  // PSV pinta los markers "poly" en orden de inserción (último = arriba, a
  // diferencia del editor que usa sendToBack) — las manzanas van primero para
  // quedar debajo de las calles, que a su vez quedan debajo de los lotes
  // (agregados después, fuera de esta función).
  const surfaceClassName = 'psv-marker--render-surface';

  if (layersVisible.manzanas !== false) {
    manzanas.forEach((shape) => {
      if (!shape.points?.length) return;
      markers.push({
        id: `render-manzana-${shape.id}`,
        polygonPixels: shape.points,
        className: surfaceClassName,
        svgStyle: { fill: colors.manzana, stroke: 'none', fillOpacity: manzanaOpacity },
        tooltip: null,
      });
    });
  }

  if (layersVisible.calles !== false) {
    const axisShapes = calles.filter((s) => s.axis && s.points?.length >= 3);
    const freehandShapes = calles.filter((s) => !s.axis && s.points?.length >= 3);

    freehandShapes.forEach((shape) => {
      markers.push({
        id: `render-calle-${shape.id}`,
        polygonPixels: shape.points,
        className: surfaceClassName,
        svgStyle: { fill: colors.calle, stroke: 'none' },
        tooltip: null,
      });
    });

    if (axisShapes.length) {
      const unionRings = unionStreetPolygons(axisShapes.map((s) => s.points));
      unionRings.forEach((ring, i) => {
        markers.push({
          id: `render-calle-union-${i}`,
          polygonPixels: ring,
          className: surfaceClassName,
          svgStyle: { fill: colors.calle, stroke: '#a68a5b', strokeWidth: '2', strokeLinejoin: 'round' },
          tooltip: null,
        });
      });
    }
  }

  return markers;
}
