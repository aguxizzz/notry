import { useEffect, useRef, useState } from 'react';
import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { annotationsToMarkers } from '../utils/annotations';
import {
  FIRST_TEMP_POINT_ID, MARKER_ID, PREFIX, domSelectorForPrefix, editCornerId, isCalibrationMarker,
  isGhostMarker, isStreetAxisHandle, isSurfaceMarker, markerIdFromDomId, parseEditCornerId,
  parseEditMidpointId, parseStreetAxisId, parseStreetAxisMidId, streetAxisId, streetAxisMidId,
  surfaceCalleId, surfaceCalleUnionId, surfaceDrawingPointId, surfaceManzanaId,
} from '../utils/markerIds';
import { findAxisEndpointSnap, findStreetShapeAtPoint, unionStreetPolygons } from '../utils/streetPath';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

// Tools that draw a polygon by clicking points and snapping to close
const isPolyDrawTool = (t) => t === 'polygon';

let viewerInstanceCount = 0;

// Superficies de manzana/calle — herramienta de prueba, sin persistencia
const SURFACE_COLORS = {
  light: { manzana: '#eae4d3', calle: '#cfc9ba' },
  dark: { manzana: '#2a2823', calle: '#151412' },
};

export default function EditorViewer({
  mode,
  panoramaUrl,
  annotations,
  activeTool,
  onClick,
  onMarkerSelect,
  onPolygonUpdate,
  onMarkerDragEnd,
  onMarkerDrag,
  getPositionRef,
  onViewerReadyChange,
  onPanoramaDimensions,
  render,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const markersPluginRef = useRef(null);
  const isPanoramaReadyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const onClickRef = useRef(onClick);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onPolygonUpdateRef = useRef(onPolygonUpdate);
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const activeToolRef = useRef(activeTool);
  const annotationsRef = useRef(annotations);
  const onPanoramaDimensionsRef = useRef(onPanoramaDimensions);

  // Modo Render (manzanas/calles): todo el estado y las acciones llegan en un
  // solo objeto desde useRenderSurfaces. Los listeners de PSV se registran una
  // vez, así que leen siempre la última versión desde estas refs.
  const modeRef = useRef(mode);
  const renderRef = useRef(render);
  const surfaceMarkerIdsRef = useRef([]);
  const annotationMarkerIdsRef = useRef([]);

  useEffect(() => {
    modeRef.current = mode;
    renderRef.current = render;
  }, [mode, render]);

  const {
    tool: renderTool, drawingPts: renderDrawingPts, manzanas: renderManzanaShapes, calles: renderCalleShapes,
    layersVisible: renderLayersVisible, colorMode: renderColorMode, manzanaOpacity: renderManzanaOpacity,
    streetWidth: renderStreetWidth, streetEditMode: renderStreetEditMode, streetEditTarget: renderStreetEditTarget,
  } = render;

  useEffect(() => {
    onClickRef.current = onClick;
    onMarkerSelectRef.current = onMarkerSelect;
    onPolygonUpdateRef.current = onPolygonUpdate;
    onMarkerDragEndRef.current = onMarkerDragEnd;
    onMarkerDragRef.current = onMarkerDrag;
    activeToolRef.current = activeTool;
    annotationsRef.current = annotations;
    onPanoramaDimensionsRef.current = onPanoramaDimensions;
  }, [onClick, onMarkerSelect, onPolygonUpdate, onMarkerDragEnd, onMarkerDrag, activeTool, annotations, onPanoramaDimensions]);

  // The panorama's real pixel size is the authoritative source for
  // texture-pixel <-> spherical conversions (see spherical.js) — more
  // reliable than backend-reported width/height, which may be stale, absent,
  // or (for a re-encoded/resized asset) simply wrong.
  useEffect(() => {
    if (!panoramaUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        onPanoramaDimensionsRef.current?.({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = panoramaUrl;
    return () => { cancelled = true; };
  }, [panoramaUrl]);

  // Init viewer
  useEffect(() => {
    if (!containerRef.current) return;

    setIsReady(false);
    const initialMarkers = annotations ? annotationsToMarkers(annotations) : [];
    annotationMarkerIdsRef.current = initialMarkers.map(m => m.id);
    const pluginConfig = MarkersPlugin.withConfig({
      markers: initialMarkers,
      // Sin esto, clickear sobre un marker (ej. una superficie de manzana)
      // solo dispara "select-marker" y nunca llega el "click" del viewer —
      // necesario para poder agregar puntos de calle sobre una manzana ya dibujada.
      clickEventOnMarker: true,
    });

    // three's FileLoader (used by PSV) dedupes in-flight requests by URL. With the
    // StrictMode double-mount, the throwaway viewer's request gets aborted on
    // destroy and the real viewer, piggybacking on it, receives that abort and
    // sits at 0% forever. A unique fragment gives each viewer its own request
    // (it is never sent to the server and doesn't affect the HTTP cache).
    viewerRef.current = new Viewer({
      container: containerRef.current,
      panorama: `${panoramaUrl}#psv${++viewerInstanceCount}`,
      adapter: EquirectangularAdapter,
      plugins: [pluginConfig],
      navbar: false,
      defaultZoomLvl: 50,
      minFov: 5,
      mousewheel: true,
      mousemove: true,
    });

    markersPluginRef.current = viewerRef.current.getPlugin(MarkersPlugin);
    isPanoramaReadyRef.current = false;

    viewerRef.current.addEventListener('ready', () => {
      isPanoramaReadyRef.current = true;
      setIsReady(true);
      if (getPositionRef) getPositionRef.current = () => viewerRef.current?.getPosition() ?? null;
      onViewerReadyChange?.(true);
    });

    viewerRef.current.addEventListener('click', (e) => {
      const r = renderRef.current;
      if (modeRef.current === 'render' && r.tool) {
        r.setDrawingPts(prev => [...prev, [e.data.textureX, e.data.textureY]]);
        return;
      }
      if (modeRef.current === 'render' && r.streetEditMode) {
        // Los handles del eje tienen su propio manejo en pointerdown/pointerup
        // — no tocar la selección de shape acá.
        if (isStreetAxisHandle(e.data.marker?.id)) return;
        // La unión visual (unionStreetPolygons) funde varias Rutas en un solo
        // marker/id, así que el id del marker clickeado ya no identifica la
        // shape — se busca por posición contra el ribbon de cada shape.
        r.selectStreet(findStreetShapeAtPoint([e.data.textureX, e.data.textureY], r.calles));
        return;
      }
      // Clickear un marker también dispara este "click" del viewer (además de
      // "select-marker", que ya lo seleccionó). Si lo dejamos pasar,
      // handleViewerClick lo interpreta como click en área vacía y deselecciona
      // (con activeTool "select") lo que se acaba de seleccionar — el lote
      // parpadea y hacen falta dos clicks. Las superficies de Render son la
      // excepción: son fondo, el click pasa como si no hubiera nada (así se
      // puede dibujar un lote encima de una manzana).
      if (e.data.marker && !isSurfaceMarker(e.data.marker.id)) return;
      onClickRef.current && onClickRef.current(e.data.textureX, e.data.textureY);
    });

    markersPluginRef.current.addEventListener('select-marker', ({ marker }) => {
      // Las superficies nunca se seleccionan como anotación: en Editar ruta la
      // calle se elige por posición (listener de "click" de arriba), y en el
      // resto de los casos son fondo.
      if (isSurfaceMarker(marker.id)) return;
      // Mientras se está dibujando una manzana/calle, un click sobre un marker
      // no debe seleccionarlo — el "click" del viewer (arriba) ya agrega el
      // punto en esa misma posición.
      if (modeRef.current === 'render' && renderRef.current.tool) return;
      onMarkerSelectRef.current && onMarkerSelectRef.current(marker.id);
    });

    return () => {
      if (getPositionRef) getPositionRef.current = null;
      onViewerReadyChange?.(false);
      viewerRef.current.destroy();
    };
  }, [panoramaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manejar el toggle entre exploración 3D y dibujo en canvas
  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setOptions({ mousemove: true, mousewheel: true });
    viewerRef.current.container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
  }, [activeTool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let draggingCorner = null;
    let draggingMarker = null;
    let draggingPolygon = null;
    let draggingStreetAxisPoint = null;
    let isSnappedToFirstPoint = false;

    const getStreetShape = shapeId => renderRef.current.calles.find(s => s.id === shapeId) ?? null;

    // Contorno provisorio de la Ruta cuyo eje se está arrastrando. Las Rutas
    // se pintan unidas en un solo contorno (unionStreetPolygons), así que no
    // hay un marker por calle que actualizar en vivo: se dibuja este encima
    // mientras dura el gesto y se saca al soltar.
    const showAxisDragPreview = (axis, width) => {
      const plugin = markersPluginRef.current;
      if (!plugin) return;
      const polygonPixels = renderRef.current.ribbonFor(axis, width);
      if (!polygonPixels?.length) return;
      const config = {
        id: MARKER_ID.surfaceAxisDragPreview,
        polygonPixels,
        svgStyle: { fill: 'rgba(14,165,233,0.18)', stroke: '#0ea5e9', strokeWidth: '2', strokeDasharray: '6,4', pointerEvents: 'none' },
        zIndex: 3,
      };
      try { plugin.updateMarker(config); } catch { plugin.addMarker(config); }
    };
    const hideAxisDragPreview = () => {
      try { markersPluginRef.current?.removeMarker(MARKER_ID.surfaceAxisDragPreview); } catch { /* ya no está */ }
    };

    const blockLeftDrag = (e) => {
      if (e.buttons === 1 || e.touches) {
        e.stopPropagation();
      }
    };

    const getTextureCoordsFromEvent = (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const spherical = viewerRef.current?.dataHelper.viewerCoordsToSphericalCoords({ x, y });
      if (!spherical) return null;
      return viewerRef.current.dataHelper.sphericalCoordsToTextureCoords(spherical);
    };

    const handlePointerDown = (e) => {
      // Actuar exclusivamente en clic izquierdo
      if (e.button !== 0) return;

      if (isSnappedToFirstPoint && isPolyDrawTool(activeToolRef.current)) {
        e.stopPropagation();
        isSnappedToFirstPoint = false;
        onMarkerSelectRef.current && onMarkerSelectRef.current(FIRST_TEMP_POINT_ID);
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
        const marker = markersPluginRef.current?.getMarker(markerId);
        if (marker && marker.config.polygonPixels) {
          const pts = [...marker.config.polygonPixels];
          
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const spherical = viewerRef.current.dataHelper.viewerCoordsToSphericalCoords({ x, y });
          if (spherical) {
            const texture = viewerRef.current.dataHelper.sphericalCoordsToTextureCoords(spherical);
            pts.splice(index + 1, 0, [texture.textureX, texture.textureY]);
            
            onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, pts);
            
            draggingCorner = { markerId, index: index + 1, lastTexture: texture };
          }
        }
        return;
      }

      const markerEl = e.target.closest('.psv-marker');
      if (markerEl) {
        const markerId = markerIdFromDomId(markerEl.id);

        // Calibration points are only draggable with the Select tool or while
        // calibrating; in other tools let the click flow through (e.g. placing
        // new calibration points)
        if (isCalibrationMarker(markerId) && activeToolRef.current !== 'select' && activeToolRef.current !== 'calibrate') {
          return;
        }

        // Dejar pasar el evento sin seleccionar ni hacer stopPropagation: si lo
        // interceptamos acá, PSV nunca genera su "click" y el punto no se
        // agrega (o se agrega en una posición vieja). Aplica a:
        //  - CUALQUIER marker mientras se dibuja una manzana/calle (incluido
        //    el propio punto recién colocado);
        //  - las superficies de Render en cualquier modo: son fondo, encima
        //    se tiene que poder dibujar un lote o deseleccionar.
        if ((modeRef.current === 'render' && renderRef.current.tool) || isSurfaceMarker(markerId)) {
          return;
        }

        e.stopPropagation();

        onMarkerSelectRef.current && onMarkerSelectRef.current(markerId);

        const marker = markersPluginRef.current?.getMarker(markerId);
        if (marker && marker.isPoly() && activeToolRef.current === 'select' && !isGhostMarker(markerId)) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const spherical = viewerRef.current.dataHelper.viewerCoordsToSphericalCoords({ x, y });
          if (spherical && marker.config.polygonPixels) {
            const texture = viewerRef.current.dataHelper.sphericalCoordsToTextureCoords(spherical);
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
      }
    };

    const handlePointerMove = (e) => {
      const r = renderRef.current;
      const isRenderSurfaceDrawing = modeRef.current === 'render' && r.tool && r.drawingPts.length >= 1;

      if (!draggingCorner && !draggingMarker && !draggingPolygon && !draggingStreetAxisPoint && !isPolyDrawTool(activeToolRef.current) && !isRenderSurfaceDrawing) return;

      const viewer = viewerRef.current;
      const markersPlugin = markersPluginRef.current;
      if (!viewer || !markersPlugin) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const spherical = viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
      if (spherical) {
        const texture = viewer.dataHelper.sphericalCoordsToTextureCoords(spherical);
        
        if (isPolyDrawTool(activeToolRef.current)) {
          const tempMarker = markersPlugin.getMarker(MARKER_ID.tempDrawing);
          if (tempMarker && tempMarker.config.polylinePixels) {
            const pts = [...tempMarker.config.polylinePixels];
            
            let snapTx = texture.textureX;
            let snapTy = texture.textureY;

            if (pts.length - 1 >= 3) {
              const firstPtMarker = markersPlugin.getMarker(FIRST_TEMP_POINT_ID);
              if (firstPtMarker && firstPtMarker.state.position2D) {
                const p2d = firstPtMarker.state.position2D;
                const dx = x - p2d.x;
                const dy = y - p2d.y;
                const screenDist = Math.sqrt(dx*dx + dy*dy);
                
                const snapPx = 15 + viewer.getZoomLevel() * 0.4;
                if (screenDist < snapPx) {
                   if (firstPtMarker.config.position) {
                      snapTx = firstPtMarker.config.position.textureX;
                      snapTy = firstPtMarker.config.position.textureY;
                      isSnappedToFirstPoint = true;
                   }
                } else {
                   isSnappedToFirstPoint = false;
                }
              } else {
                 isSnappedToFirstPoint = false;
              }
            } else {
               isSnappedToFirstPoint = false;
            }

            pts[pts.length - 1] = [snapTx, snapTy];
            markersPlugin.updateMarker({
              id: MARKER_ID.tempDrawing,
              polylinePixels: pts
            });
          }
        }

        if (isRenderSurfaceDrawing) {
          const tempSurfaceMarker = markersPlugin.getMarker(MARKER_ID.surfaceDrawing);
          if (tempSurfaceMarker && tempSurfaceMarker.config.polylinePixels) {
            const pts = [...tempSurfaceMarker.config.polylinePixels];
            pts[pts.length - 1] = [texture.textureX, texture.textureY];
            markersPlugin.updateMarker({
              id: MARKER_ID.surfaceDrawing,
              polylinePixels: pts
            });

            if (r.tool === 'calle') {
              const previewMarker = markersPlugin.getMarker(MARKER_ID.surfaceStreetPreview);
              const polygonPixels = r.ribbonFor(pts, r.streetWidth);
              if (previewMarker && polygonPixels.length) {
                markersPlugin.updateMarker({ id: MARKER_ID.surfaceStreetPreview, polygonPixels });
              }
            }
          }
        }

        if (draggingStreetAxisPoint) {
          const { shapeId, index } = draggingStreetAxisPoint;
          const newAxis = [...draggingStreetAxisPoint.axis];
          newAxis[index] = [texture.textureX, texture.textureY];
          draggingStreetAxisPoint.axis = newAxis;
          showAxisDragPreview(newAxis, getStreetShape(shapeId)?.width ?? r.streetWidth);
          if (!draggingStreetAxisPoint.isNew) {
            markersPlugin.updateMarker({
              id: streetAxisId(shapeId, index),
              position: { textureX: texture.textureX, textureY: texture.textureY },
            });
          }
        }

        if (draggingCorner) {
          const cornerMarkerId = editCornerId(draggingCorner.markerId, draggingCorner.index);
          markersPlugin.updateMarker({
            id: cornerMarkerId,
            position: { textureX: texture.textureX, textureY: texture.textureY }
          });

          const polyMarker = markersPlugin.getMarker(draggingCorner.markerId);
          if (polyMarker && polyMarker.config.polygonPixels) {
            const newPixels = [...polyMarker.config.polygonPixels];
            newPixels[draggingCorner.index] = [texture.textureX, texture.textureY];
            markersPlugin.updateMarker({
              id: draggingCorner.markerId,
              polygonPixels: newPixels
            });
          }
          
          draggingCorner.lastTexture = texture;
        } else if (draggingPolygon) {
          draggingPolygon.isDrag = true;
          const dx = texture.textureX - draggingPolygon.startTexture.textureX;
          const dy = texture.textureY - draggingPolygon.startTexture.textureY;
          const newPixels = draggingPolygon.originalPixels.map(([px, py]) => [px + dx, py + dy]);
          markersPlugin.updateMarker({
            id: draggingPolygon.markerId,
            polygonPixels: newPixels,
          });
          draggingPolygon.lastPixels = newPixels;
        } else if (draggingMarker) {
          draggingMarker.isDrag = true;
          markersPlugin.updateMarker({
            id: draggingMarker.markerId,
            position: { textureX: texture.textureX, textureY: texture.textureY }
          });
          draggingMarker.lastTexture = texture;
          // Calibration points update state live so ghost polygons reproject in real time
          if (isCalibrationMarker(draggingMarker.markerId)) {
            onMarkerDragRef.current?.(draggingMarker.markerId, texture.textureX, texture.textureY);
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (draggingStreetAxisPoint) {
        const { shapeId, axis } = draggingStreetAxisPoint;
        hideAxisDragPreview();
        renderRef.current.setStreetAxis(shapeId, axis);
        draggingStreetAxisPoint = null;
        return;
      }
      if (draggingCorner) {
        if (draggingCorner.lastTexture && onPolygonUpdateRef.current) {
          const polyMarker = markersPluginRef.current?.getMarker(draggingCorner.markerId);
          if (polyMarker && polyMarker.config.polygonPixels) {
            onPolygonUpdateRef.current(draggingCorner.markerId, polyMarker.config.polygonPixels);
          }
        }
        draggingCorner = null;
      } else if (draggingPolygon) {
        if (draggingPolygon.isDrag && draggingPolygon.lastPixels && onPolygonUpdateRef.current) {
          onPolygonUpdateRef.current(draggingPolygon.markerId, draggingPolygon.lastPixels);
        }
        draggingPolygon = null;
      } else if (draggingMarker) {
        if (draggingMarker.isDrag && draggingMarker.lastTexture && onMarkerDragEndRef.current) {
          onMarkerDragEndRef.current(
            draggingMarker.markerId,
            draggingMarker.lastTexture.textureX,
            draggingMarker.lastTexture.textureY
          );
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
  }, []);

  // Sync annotations to markers. Se agregan/quitan con addMarker/removeMarker
  // (en vez de setMarkers, que reemplaza TODO el set del plugin) para no
  // pisar las superficies de manzana/calle que pinta el efecto de abajo.
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !annotations || !viewerRef.current || !isReady) return;

    annotationMarkerIdsRef.current.forEach(id => {
      try { plugin.removeMarker(id); } catch { /* ya no existe */ }
    });
    annotationMarkerIdsRef.current = [];

    if (mode === 'render' && !renderLayersVisible?.lotes) {
      return;
    }

    const markers = annotationsToMarkers(annotations);

    const viewer = viewerRef.current;
    if (viewer) {
      markers.forEach(m => {
        const midpoint = parseEditMidpointId(m.id);
        if (midpoint) {
           const { ownerId: polyId, index } = midpoint;
           const poly = annotations.find(a => a.id === polyId);
           if (poly && poly.polygonPixels) {
              const pt1 = poly.polygonPixels[index];
              const pt2 = poly.polygonPixels[(index + 1) % poly.polygonPixels.length];

              const sph1 = viewer.dataHelper.textureCoordsToSphericalCoords({ textureX: pt1[0], textureY: pt1[1] });
              const sph2 = viewer.dataHelper.textureCoordsToSphericalCoords({ textureX: pt2[0], textureY: pt2[1] });

              const v1 = {
                 x: Math.cos(sph1.pitch) * Math.sin(sph1.yaw),
                 y: Math.sin(sph1.pitch),
                 z: -Math.cos(sph1.pitch) * Math.cos(sph1.yaw)
              };
              const v2 = {
                 x: Math.cos(sph2.pitch) * Math.sin(sph2.yaw),
                 y: Math.sin(sph2.pitch),
                 z: -Math.cos(sph2.pitch) * Math.cos(sph2.yaw)
              };

              const midV = {
                 x: (v1.x + v2.x) / 2,
                 y: (v1.y + v2.y) / 2,
                 z: (v1.z + v2.z) / 2
              };
              const len = Math.sqrt(midV.x*midV.x + midV.y*midV.y + midV.z*midV.z);
              midV.x /= len; midV.y /= len; midV.z /= len;

              const midSph = {
                 pitch: Math.asin(midV.y),
                 yaw: Math.atan2(midV.x, -midV.z)
              };
              if (midSph.yaw < 0) midSph.yaw += 2 * Math.PI;

              const midTex = viewer.dataHelper.sphericalCoordsToTextureCoords(midSph);

              if (m.position) {
                 m.position = { textureX: midTex.textureX, textureY: midTex.textureY };
              }
           }
        }
      });
    }

    markers.forEach(m => plugin.addMarker(m));
    annotationMarkerIdsRef.current = markers.map(m => m.id);
  }, [annotations, mode, renderLayersVisible?.lotes, isReady]);

  // Superficies de manzana/calle de prueba: se pintan aparte del pipeline real
  // de anotaciones (addMarker/removeMarker directos), así el setMarkers de
  // arriba nunca las persiste ni las manda al backend. Depende de `annotations`
  // para volver a dibujarlas después de cada setMarkers (que reemplaza todo).
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !isReady) return;

    surfaceMarkerIdsRef.current.forEach(id => {
      try { plugin.removeMarker(id); } catch { /* ya no existe */ }
    });
    surfaceMarkerIdsRef.current = [];

    const colors = SURFACE_COLORS[renderColorMode] ?? SURFACE_COLORS.light;
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
    // celeste inserta uno nuevo — ver handlePointerDown/Move más abajo.
    const addStreetAxisHandles = (shape) => {
      if (!renderStreetEditMode || renderStreetEditTarget !== shape.id || !shape.axis) return;
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

    if (renderLayersVisible?.calles) {
      // Las Rutas (shape.axis) que se tocan en un vértice interior (ver
      // findAxisEndpointSnap/unionStreetPolygons) se dibujan como un solo
      // contorno unido en vez de un polígono con stroke por shape — si no,
      // el borde de una calle corta por encima de la otra en la unión.
      const axisShapes = renderCalleShapes.filter(s => s.axis);
      const freehandShapes = renderCalleShapes.filter(s => !s.axis);

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

      renderCalleShapes.forEach(shape => {
        addStreetAxisHandles(shape);
      });
    }
    if (renderLayersVisible?.manzanas) {
      renderManzanaShapes.forEach(shape => {
        const id = surfaceManzanaId(shape.id);
        plugin.addMarker({
          id,
          polygonPixels: shape.points,
          svgStyle: { fill: colors.manzana, stroke: 'none', fillOpacity: renderManzanaOpacity },
          tooltip: null,
        });
        sendToBack(id);
        newIds.push(id);
      });
    }
    if (renderDrawingPts.length >= 1) {
      const id = MARKER_ID.surfaceDrawing;
      const isStreetPath = renderTool === 'calle';
      // Si el primer click cae cerca del eje de otra Ruta, se previsualiza ya
      // snappeado al punto exacto (para que la costura de unión se vea bien
      // antes de confirmar) y se resalta ese punto en verde.
      const snap = isStreetPath ? findAxisEndpointSnap(renderDrawingPts[0], renderCalleShapes) : null;
      const drawingPts = snap ? [snap.point, ...renderDrawingPts.slice(1)] : renderDrawingPts;
      const ptsWithCursor = [...drawingPts, drawingPts[drawingPts.length - 1]];
      plugin.addMarker({
        id,
        polylinePixels: ptsWithCursor,
        svgStyle: { stroke: '#ffa500', strokeWidth: '3', strokeDasharray: '5,5' },
        zIndex: 2,
      });
      newIds.push(id);

      // Mismo contorno que va a quedar al finalizar (con calibración, pasa por
      // el plano — ver streetRibbon).
      const previewRibbon = isStreetPath ? renderRef.current.ribbonFor(ptsWithCursor, renderStreetWidth) : [];
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

      drawingPts.forEach((pt, i) => {
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
  }, [annotations, isReady, renderManzanaShapes, renderCalleShapes, renderColorMode, renderManzanaOpacity, renderDrawingPts, renderLayersVisible?.manzanas, renderLayersVisible?.calles, renderTool, renderStreetWidth, renderStreetEditMode, renderStreetEditTarget]);

  // Escape cancela el dibujo en curso, Enter lo cierra (>=3 puntos, o >=2 para calle/Ruta)
  useEffect(() => {
    if (mode !== 'render' || !renderTool) return;
    const handleKeyDown = (e) => {
      const r = renderRef.current;
      if (e.key === 'Escape') r.cancelDrawing();
      else if (e.key === 'Enter' && r.canFinishShape) r.finishShape();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, renderTool]);

  // Cursor crosshair mientras se dibuja una superficie en modo Render
  useEffect(() => {
    if (!viewerRef.current) return;
    if (mode === 'render' && renderTool) {
      viewerRef.current.container.style.cursor = 'crosshair';
    } else {
      viewerRef.current.container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    }
  }, [mode, renderTool, activeTool]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
