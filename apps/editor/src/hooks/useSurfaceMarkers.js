import { useEffect, useRef } from 'react';
import {
  MARKER_ID, streetAxisId, streetAxisMidId, surfaceCalleId, surfaceCalleUnionId, surfaceDrawingPointId,
  surfaceManzanaId,
} from '../utils/markerIds';
import { findAxisEndpointSnap, unionStreetPolygons } from '../utils/streetPath';
import { findShape } from '../utils/renderSurfaces';

const SURFACE_COLORS = {
  light: { manzana: '#eae4d3', calle: '#cfc9ba' },
  dark: { manzana: '#2a2823', calle: '#151412' },
};

/**
 * Pinta en el panorama las superficies del modo Render (manzanas, calles,
 * selección, trazo en curso y handles del eje en Editar ruta).
 *
 * Van aparte del pipeline de anotaciones (addMarker/removeMarker directos),
 * así nunca se mezclan con los lotes que se guardan. Depende de
 * `annotations` para volver a ponerlas detrás después de que se repintan
 * los lotes. `latest.current.render.ribbonFor` se lee del ref para no
 * repintar todo en cada render por una función nueva.
 */
export function useSurfaceMarkers({ markersPluginRef, isReady, annotations, render, latest }) {
  const surfaceMarkerIdsRef = useRef([]);
  const {
    tool, drawingPts, manzanas, calles, layersVisible, colorMode, manzanaOpacity,
    streetWidth, streetEditMode, streetEditTarget, selectedSurface,
  } = render;

  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !isReady) return;

    surfaceMarkerIdsRef.current.forEach(id => {
      try { plugin.removeMarker(id); } catch { /* ya no existe */ }
    });
    surfaceMarkerIdsRef.current = [];

    const colors = SURFACE_COLORS[colorMode] ?? SURFACE_COLORS.light;
    const newIds = [];

    // Los markers "poly" de PSV (lotes, superficies) viven en un <svg>
    // compartido: el orden de pintado lo da el orden en el DOM, no `zIndex`
    // (eso solo afecta a markers HTML/CSS3D, como los puntos de calibración).
    // Por eso, tras agregar cada superficie, la reinsertamos como primer hijo
    // de su contenedor para que quede detrás de los lotes ya pintados.
    const sendToBack = (id) => {
      const marker = plugin.getMarker(id);
      const el = marker?.domElement;
      if (el && el.parentNode) {
        el.parentNode.insertBefore(el, el.parentNode.firstChild);
      }
    };

    // Puntos del eje de una calle trazada con "Ruta" (solo la shape en
    // edición): arrastrar un punto mueve el eje, arrastrar un punto medio
    // celeste inserta uno nuevo — ver usePanoramaPointer.
    const addStreetAxisHandles = (shape) => {
      if (!streetEditMode || streetEditTarget !== shape.id || !shape.axis) return;
      shape.axis.forEach((pt, i) => {
        const id = streetAxisId(shape.id, i);
        plugin.addMarker({
          id,
          position: { textureX: pt[0], textureY: pt[1] },
          circle: 5,
          svgStyle: { fill: '#fff', stroke: '#0ea5e9', strokeWidth: '2', cursor: 'grab' },
          tooltip: 'Arrastrá para mover el punto del eje',
          zIndex: 4,
        });
        newIds.push(id);
      });
      for (let i = 0; i < shape.axis.length - 1; i++) {
        const [x0, y0] = shape.axis[i];
        const [x1, y1] = shape.axis[i + 1];
        const id = streetAxisMidId(shape.id, i);
        plugin.addMarker({
          id,
          position: { textureX: (x0 + x1) / 2, textureY: (y0 + y1) / 2 },
          circle: 4,
          svgStyle: { fill: '#0ea5e9', stroke: '#fff', strokeWidth: '1.5', cursor: 'copy' },
          tooltip: 'Arrastrá para agregar un punto',
          zIndex: 4,
        });
        newIds.push(id);
      }
    };

    if (layersVisible?.calles) {
      // Las Rutas (shape.axis) que se tocan en un vértice interior (ver
      // findAxisEndpointSnap/unionStreetPolygons) se dibujan como un solo
      // contorno unido en vez de un polígono con stroke por shape — si no,
      // el borde de una calle corta por encima de la otra en la unión.
      const axisShapes = calles.filter(s => s.axis);
      const freehandShapes = calles.filter(s => !s.axis);

      freehandShapes.forEach(shape => {
        const id = surfaceCalleId(shape.id);
        plugin.addMarker({
          id,
          polygonPixels: shape.points,
          svgStyle: { fill: colors.calle, stroke: 'none' },
          tooltip: null,
        });
        sendToBack(id);
        newIds.push(id);
      });

      if (axisShapes.length) {
        const unionRings = unionStreetPolygons(axisShapes.map(shape => shape.points));
        unionRings.forEach((ring, i) => {
          const id = surfaceCalleUnionId(i);
          plugin.addMarker({
            id,
            polygonPixels: ring,
            svgStyle: { fill: colors.calle, stroke: '#a68a5b', strokeWidth: '2', strokeLinejoin: 'round' },
            tooltip: null,
          });
          sendToBack(id);
          newIds.push(id);
        });
      }

      calles.forEach(shape => {
        addStreetAxisHandles(shape);
      });
    }
    if (layersVisible?.manzanas) {
      manzanas.forEach(shape => {
        const id = surfaceManzanaId(shape.id);
        plugin.addMarker({
          id,
          polygonPixels: shape.points,
          svgStyle: { fill: colors.manzana, stroke: 'none', fillOpacity: manzanaOpacity },
          tooltip: null,
        });
        sendToBack(id);
        newIds.push(id);
      });
    }
    const selectedShape = findShape({ manzanas, calles }, selectedSurface);
    if (selectedShape) {
      const id = MARKER_ID.surfaceSelection;
      plugin.addMarker({
        id,
        polygonPixels: selectedShape.points,
        svgStyle: { fill: 'none', stroke: '#0ea5e9', strokeWidth: '3', strokeDasharray: '8,5' },
        tooltip: null,
        zIndex: 3,
      });
      newIds.push(id);
    }
    if (drawingPts.length >= 1) {
      const id = MARKER_ID.surfaceDrawing;
      const isStreetPath = tool === 'calle';
      // Si el primer click cae cerca del eje de otra Ruta, se previsualiza ya
      // snappeado al punto exacto (para que la costura de unión se vea bien
      // antes de confirmar) y se resalta ese punto en verde.
      const snap = isStreetPath ? findAxisEndpointSnap(drawingPts[0], calles) : null;
      const pts = snap ? [snap.point, ...drawingPts.slice(1)] : drawingPts;
      const ptsWithCursor = [...pts, pts[pts.length - 1]];
      plugin.addMarker({
        id,
        polylinePixels: ptsWithCursor,
        svgStyle: { stroke: '#ffa500', strokeWidth: '3', strokeDasharray: '5,5' },
        zIndex: 2,
      });
      newIds.push(id);

      // Mismo contorno que va a quedar al finalizar (con calibración, pasa por
      // el plano — ver streetRibbon).
      const previewRibbon = isStreetPath ? latest.current.render.ribbonFor(ptsWithCursor, streetWidth) : [];
      if (previewRibbon.length) {
        const previewId = MARKER_ID.surfaceStreetPreview;
        plugin.addMarker({
          id: previewId,
          polygonPixels: previewRibbon,
          svgStyle: { fill: colors.calle, stroke: '#ffa500', strokeWidth: '1.5', strokeDasharray: '4,4', fillOpacity: 0.6 },
          zIndex: 1,
        });
        newIds.push(previewId);
      }

      pts.forEach((pt, i) => {
        const ptId = surfaceDrawingPointId(i);
        plugin.addMarker({
          id: ptId,
          position: { textureX: pt[0], textureY: pt[1] },
          circle: i === 0 ? 4 : 3,
          svgStyle: { fill: i === 0 && snap ? '#4ade80' : '#ffa500' },
          zIndex: 2,
        });
        newIds.push(ptId);
      });
    }
    surfaceMarkerIdsRef.current = newIds;
  }, [
    markersPluginRef, latest, annotations, isReady, manzanas, calles, colorMode, manzanaOpacity, drawingPts,
    layersVisible?.manzanas, layersVisible?.calles, tool, streetWidth, streetEditMode, streetEditTarget,
    selectedSurface,
  ]);
}
