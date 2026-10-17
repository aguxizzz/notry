import { useEffect } from 'react';
import {
  FIRST_TEMP_POINT_ID, MARKER_ID, PREFIX, domSelectorForPrefix, editCornerId, editMidpointId, isCalibrationMarker,
  isGhostMarker, isSurfaceMarker, markerIdFromDomId, parseEditCornerId, parseEditMidpointId, parseStreetAxisId,
  parseStreetAxisMidId, streetAxisId,
} from '../utils/markerIds';
import { edgeMidpoints } from './useDisplayAnnotations';

// Tools that draw a polygon by clicking points and snapping to close
const isPolyDrawTool = (t) => t === 'polygon';

// getMarker/updateMarker de PSV tiran si el marker no existe (p. ej. el trazo
// temporal antes del primer click, o los handles antes de que se seleccione).
const findMarker = (plugin, id) => {
  try { return plugin.getMarker(id); } catch { return null; }
};
const updateIfPresent = (plugin, config, render = true) => {
  if (findMarker(plugin, config.id)) plugin.updateMarker(config, render);
};

/**
 * Interacciones de puntero sobre el panorama: arrastrar esquinas, puntos
 * medios (insertar vértice), lotes enteros, markers sueltos (POIs, puntos de
 * calibración) y puntos del eje de una Ruta; y el snap al primer punto al
 * dibujar un polígono.
 *
 * Mientras dura el gesto se actualizan los markers de PSV directamente (sin
 * pasar por el estado de React); al soltar se confirma con un callback.
 * Se registra una sola vez: todo lo que cambia se lee de `latest.current`
 * ({ activeTool, mode, render, midpointOf, onMarkerSelect, onPolygonUpdate,
 * onMarkerDragEnd, onMarkerDrag }).
 */
export function usePanoramaPointer({ containerRef, viewerRef, markersPluginRef, latest }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let draggingCorner = null;
    let draggingMarker = null;
    let draggingPolygon = null;
    let draggingStreetAxisPoint = null;
    let isSnappedToFirstPoint = false;

    const getStreetShape = shapeId => latest.current.render.calles.find(s => s.id === shapeId) ?? null;

    // Esquinas y puntos medios del lote seleccionado siguen al polígono en
    // vivo mientras se arrastra (si no, quedan en el lugar viejo hasta soltar).
    const moveVertexHandles = (plugin, ownerId, pixels) => {
      const midpoints = edgeMidpoints(pixels, latest.current.midpointOf);
      pixels.forEach(([x, y], i) => {
        updateIfPresent(plugin, { id: editCornerId(ownerId, i), position: { textureX: x, textureY: y } }, false);
        const [mx, my] = midpoints[i];
        updateIfPresent(plugin, { id: editMidpointId(ownerId, i), position: { textureX: mx, textureY: my } }, false);
      });
    };

    // Contorno provisorio de la Ruta cuyo eje se está arrastrando. Las Rutas
    // se pintan unidas en un solo contorno (unionStreetPolygons), así que no
    // hay un marker por calle que actualizar en vivo: se dibuja este encima
    // mientras dura el gesto y se saca al soltar.
    const showAxisDragPreview = (axis, width) => {
      const plugin = markersPluginRef.current;
      if (!plugin) return;
      const polygonPixels = latest.current.render.ribbonFor(axis, width);
      if (!polygonPixels?.length) return;
      const config = {
        id: MARKER_ID.surfaceAxisDragPreview,
        polygonPixels,
        svgStyle: { fill: 'rgba(14,165,233,0.18)', stroke: '#0ea5e9', strokeWidth: '2', strokeDasharray: '6,4', pointerEvents: 'none' },
        zIndex: 3,
      };
      if (findMarker(plugin, config.id)) plugin.updateMarker(config);
      else plugin.addMarker(config);
    };
    const hideAxisDragPreview = () => {
      const plugin = markersPluginRef.current;
      if (plugin && findMarker(plugin, MARKER_ID.surfaceAxisDragPreview)) {
        plugin.removeMarker(MARKER_ID.surfaceAxisDragPreview);
      }
    };

    const blockLeftDrag = (e) => {
      if (e.buttons === 1 || e.touches) {
        e.stopPropagation();
      }
    };

    const getTextureCoordsFromEvent = (e) => {
      const rect = container.getBoundingClientRect();
      const spherical = viewerRef.current?.dataHelper.viewerCoordsToSphericalCoords({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      if (!spherical) return null;
      return viewerRef.current.dataHelper.sphericalCoordsToTextureCoords(spherical);
    };

    const handlePointerDown = (e) => {
      // Actuar exclusivamente en clic izquierdo
      if (e.button !== 0) return;
      const { activeTool, mode, render, onMarkerSelect, onPolygonUpdate } = latest.current;

      if (isSnappedToFirstPoint && isPolyDrawTool(activeTool)) {
        e.stopPropagation();
        isSnappedToFirstPoint = false;
        onMarkerSelect?.(FIRST_TEMP_POINT_ID);
        return;
      }

      // Id del marker bajo el puntero si es de los que tienen el prefijo dado.
      const markerIdUnder = prefix => {
        const el = e.target.closest(domSelectorForPrefix(prefix));
        return el ? markerIdFromDomId(el.id) : null;
      };

      const corner = parseEditCornerId(markerIdUnder(PREFIX.editCorner));
      if (corner) {
        e.stopPropagation();
        draggingCorner = { markerId: corner.ownerId, index: corner.index, lastTexture: null };
        return;
      }

      const axisPoint = parseStreetAxisId(markerIdUnder(PREFIX.streetAxis));
      if (axisPoint) {
        e.stopPropagation();
        const shapeId = axisPoint.ownerId;
        const shape = getStreetShape(shapeId);
        if (shape?.axis) {
          draggingStreetAxisPoint = { shapeId, index: axisPoint.index, axis: [...shape.axis] };
        }
        return;
      }

      const axisMid = parseStreetAxisMidId(markerIdUnder(PREFIX.streetAxisMid));
      if (axisMid) {
        e.stopPropagation();
        const shapeId = axisMid.ownerId;
        const segIndex = axisMid.index;
        const shape = getStreetShape(shapeId);
        if (shape?.axis) {
          const texture = getTextureCoordsFromEvent(e);
          const insertAt = segIndex + 1;
          const newAxis = [...shape.axis];
          newAxis.splice(insertAt, 0, texture ? [texture.textureX, texture.textureY] : shape.axis[segIndex]);
          draggingStreetAxisPoint = { shapeId, index: insertAt, axis: newAxis, isNew: true };
        }
        return;
      }

      const midpoint = parseEditMidpointId(markerIdUnder(PREFIX.editMidpoint));
      if (midpoint) {
        e.stopPropagation();
        const { ownerId: markerId, index } = midpoint;
        const marker = findMarker(markersPluginRef.current, markerId);
        const texture = getTextureCoordsFromEvent(e);
        if (marker?.config.polygonPixels && texture) {
          const pts = [...marker.config.polygonPixels];
          pts.splice(index + 1, 0, [texture.textureX, texture.textureY]);
          onPolygonUpdate?.(markerId, pts);
          draggingCorner = { markerId, index: index + 1, lastTexture: texture };
        }
        return;
      }

      const markerEl = e.target.closest('.psv-marker');
      if (!markerEl) return;
      const markerId = markerIdFromDomId(markerEl.id);

      // Calibration points are only draggable with the Select tool or while
      // calibrating; in other tools let the click flow through (e.g. placing
      // new calibration points)
      if (isCalibrationMarker(markerId) && activeTool !== 'select' && activeTool !== 'calibrate') {
        return;
      }

      // Dejar pasar el evento sin seleccionar ni hacer stopPropagation: si lo
      // interceptamos acá, PSV nunca genera su "click" y el punto no se
      // agrega (o se agrega en una posición vieja). Aplica a:
      //  - CUALQUIER marker mientras se dibuja una manzana/calle (incluido
      //    el propio punto recién colocado);
      //  - las superficies de Render en cualquier modo: son fondo, encima
      //    se tiene que poder dibujar un lote o deseleccionar.
      if ((mode === 'render' && render.tool) || isSurfaceMarker(markerId)) {
        return;
      }

      e.stopPropagation();
      onMarkerSelect?.(markerId);

      const marker = findMarker(markersPluginRef.current, markerId);
      if (marker && marker.isPoly() && activeTool === 'select' && !isGhostMarker(markerId)) {
        const texture = getTextureCoordsFromEvent(e);
        if (texture && marker.config.polygonPixels) {
          draggingPolygon = {
            markerId,
            startTexture: texture,
            originalPixels: marker.config.polygonPixels.map(pt => [...pt]),
            lastPixels: null,
            isDrag: false,
          };
        }
      } else if (marker && !marker.isPoly()) {
        draggingMarker = { markerId, lastTexture: null, isDrag: false };
      }
    };

    // Trazo del polígono en curso: la última punta sigue al cursor, y a menos
    // de unos px del primer punto se pega a él (click ahí = cerrar).
    const updatePolygonDrawing = (plugin, viewer, texture, x, y) => {
      const tempMarker = findMarker(plugin, MARKER_ID.tempDrawing);
      if (!tempMarker?.config.polylinePixels) return;
      const pts = [...tempMarker.config.polylinePixels];

      let snapTx = texture.textureX;
      let snapTy = texture.textureY;
      isSnappedToFirstPoint = false;

      if (pts.length - 1 >= 3) {
        const firstPtMarker = findMarker(plugin, FIRST_TEMP_POINT_ID);
        const p2d = firstPtMarker?.state.position2D;
        if (p2d) {
          const screenDist = Math.hypot(x - p2d.x, y - p2d.y);
          const snapPx = 15 + viewer.getZoomLevel() * 0.4;
          if (screenDist < snapPx && firstPtMarker.config.position) {
            snapTx = firstPtMarker.config.position.textureX;
            snapTy = firstPtMarker.config.position.textureY;
            isSnappedToFirstPoint = true;
          }
        }
      }

      pts[pts.length - 1] = [snapTx, snapTy];
      plugin.updateMarker({ id: MARKER_ID.tempDrawing, polylinePixels: pts });
    };

    // Trazo de manzana/calle en curso (modo Render): idem, más la vista previa
    // del contorno de la calle.
    const updateSurfaceDrawing = (plugin, render, texture) => {
      const tempSurfaceMarker = findMarker(plugin, MARKER_ID.surfaceDrawing);
      if (!tempSurfaceMarker?.config.polylinePixels) return;
      const pts = [...tempSurfaceMarker.config.polylinePixels];
      pts[pts.length - 1] = [texture.textureX, texture.textureY];
      plugin.updateMarker({ id: MARKER_ID.surfaceDrawing, polylinePixels: pts });

      if (render.tool === 'calle') {
        const polygonPixels = render.ribbonFor(pts, render.streetWidth);
        if (polygonPixels.length) {
          updateIfPresent(plugin, { id: MARKER_ID.surfaceStreetPreview, polygonPixels });
        }
      }
    };

    const handlePointerMove = (e) => {
      const { activeTool, mode, render, onMarkerDrag } = latest.current;
      const isRenderSurfaceDrawing = mode === 'render' && render.tool && render.drawingPts.length >= 1;

      if (!draggingCorner && !draggingMarker && !draggingPolygon && !draggingStreetAxisPoint
        && !isPolyDrawTool(activeTool) && !isRenderSurfaceDrawing) return;

      const viewer = viewerRef.current;
      const plugin = markersPluginRef.current;
      if (!viewer || !plugin) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const spherical = viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
      if (!spherical) return;
      const texture = viewer.dataHelper.sphericalCoordsToTextureCoords(spherical);

      if (isPolyDrawTool(activeTool)) updatePolygonDrawing(plugin, viewer, texture, x, y);
      if (isRenderSurfaceDrawing) updateSurfaceDrawing(plugin, render, texture);

      if (draggingStreetAxisPoint) {
        const { shapeId, index } = draggingStreetAxisPoint;
        const newAxis = [...draggingStreetAxisPoint.axis];
        newAxis[index] = [texture.textureX, texture.textureY];
        draggingStreetAxisPoint.axis = newAxis;
        showAxisDragPreview(newAxis, getStreetShape(shapeId)?.width ?? render.streetWidth);
        if (!draggingStreetAxisPoint.isNew) {
          updateIfPresent(plugin, {
            id: streetAxisId(shapeId, index),
            position: { textureX: texture.textureX, textureY: texture.textureY },
          });
        }
      }

      if (draggingCorner) {
        const polyMarker = findMarker(plugin, draggingCorner.markerId);
        if (polyMarker?.config.polygonPixels) {
          const newPixels = [...polyMarker.config.polygonPixels];
          newPixels[draggingCorner.index] = [texture.textureX, texture.textureY];
          moveVertexHandles(plugin, draggingCorner.markerId, newPixels);
          plugin.updateMarker({ id: draggingCorner.markerId, polygonPixels: newPixels });
        }
        draggingCorner.lastTexture = texture;
      } else if (draggingPolygon) {
        draggingPolygon.isDrag = true;
        const dx = texture.textureX - draggingPolygon.startTexture.textureX;
        const dy = texture.textureY - draggingPolygon.startTexture.textureY;
        const newPixels = draggingPolygon.originalPixels.map(([px, py]) => [px + dx, py + dy]);
        moveVertexHandles(plugin, draggingPolygon.markerId, newPixels);
        plugin.updateMarker({ id: draggingPolygon.markerId, polygonPixels: newPixels });
        draggingPolygon.lastPixels = newPixels;
      } else if (draggingMarker) {
        draggingMarker.isDrag = true;
        updateIfPresent(plugin, {
          id: draggingMarker.markerId,
          position: { textureX: texture.textureX, textureY: texture.textureY },
        });
        draggingMarker.lastTexture = texture;
        // Calibration points update state live so ghost polygons reproject in real time
        if (isCalibrationMarker(draggingMarker.markerId)) {
          onMarkerDrag?.(draggingMarker.markerId, texture.textureX, texture.textureY);
        }
      }
    };

    const handlePointerUp = () => {
      const { render, onPolygonUpdate, onMarkerDragEnd } = latest.current;
      if (draggingStreetAxisPoint) {
        const { shapeId, axis } = draggingStreetAxisPoint;
        hideAxisDragPreview();
        render.setStreetAxis(shapeId, axis);
        draggingStreetAxisPoint = null;
        return;
      }
      if (draggingCorner) {
        if (draggingCorner.lastTexture) {
          const polyMarker = findMarker(markersPluginRef.current, draggingCorner.markerId);
          if (polyMarker?.config.polygonPixels) {
            onPolygonUpdate?.(draggingCorner.markerId, polyMarker.config.polygonPixels);
          }
        }
        draggingCorner = null;
      } else if (draggingPolygon) {
        if (draggingPolygon.isDrag && draggingPolygon.lastPixels) {
          onPolygonUpdate?.(draggingPolygon.markerId, draggingPolygon.lastPixels);
        }
        draggingPolygon = null;
      } else if (draggingMarker) {
        if (draggingMarker.isDrag && draggingMarker.lastTexture) {
          onMarkerDragEnd?.(draggingMarker.markerId, draggingMarker.lastTexture.textureX, draggingMarker.lastTexture.textureY);
        }
        draggingMarker = null;
      }
    };

    container.addEventListener('mousemove', blockLeftDrag, { capture: true });
    container.addEventListener('touchmove', blockLeftDrag, { capture: true });
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      container.removeEventListener('mousemove', blockLeftDrag, { capture: true });
      container.removeEventListener('touchmove', blockLeftDrag, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [containerRef, viewerRef, markersPluginRef, latest]);
}
