import { useEffect, useRef, useState } from 'react';
import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { annotationsToMarkers } from '../utils/annotations';
import { buildStreetRibbon, findAxisEndpointSnap, findStreetShapeAtPoint, unionStreetPolygons } from '../utils/streetPath';
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
  renderTestMode,
  renderDrawingPts,
  onRenderDrawingPtsChange,
  renderManzanaShapes,
  renderCalleShapes,
  renderLayersVisible,
  renderColorMode,
  renderManzanaOpacity = 1,
  onFinishRenderShape,
  onCancelRenderDrawing,
  renderStreetWidth,
  renderStreetEditMode,
  renderStreetEditTarget,
  onStreetShapeSelect,
  onStreetAxisChange,
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

  // --- Superficies de manzana/calle (modo Render): herramienta de prueba, sin
  // persistencia — el estado vive en App.jsx y llega acá como props. ---
  const modeRef = useRef(mode);
  const renderTestModeRef = useRef(renderTestMode);
  const renderDrawingPtsRef = useRef(renderDrawingPts);
  const surfaceMarkerIdsRef = useRef([]);
  const annotationMarkerIdsRef = useRef([]);
  const renderManzanaShapesRef = useRef(renderManzanaShapes);
  const renderCalleShapesRef = useRef(renderCalleShapes);

  const renderStreetWidthRef = useRef(renderStreetWidth);
  const renderStreetEditModeRef = useRef(renderStreetEditMode);
  const renderStreetEditTargetRef = useRef(renderStreetEditTarget);
  const onStreetShapeSelectRef = useRef(onStreetShapeSelect);
  const onStreetAxisChangeRef = useRef(onStreetAxisChange);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    renderTestModeRef.current = renderTestMode;
  }, [renderTestMode]);

  useEffect(() => {
    renderDrawingPtsRef.current = renderDrawingPts;
  }, [renderDrawingPts]);

  useEffect(() => {
    renderManzanaShapesRef.current = renderManzanaShapes;
    renderCalleShapesRef.current = renderCalleShapes;
  }, [renderManzanaShapes, renderCalleShapes]);

  useEffect(() => {
    renderStreetWidthRef.current = renderStreetWidth;
  }, [renderStreetWidth]);

  useEffect(() => {
    renderStreetEditModeRef.current = renderStreetEditMode;
    renderStreetEditTargetRef.current = renderStreetEditTarget;
    onStreetShapeSelectRef.current = onStreetShapeSelect;
    onStreetAxisChangeRef.current = onStreetAxisChange;
  }, [renderStreetEditMode, renderStreetEditTarget, onStreetShapeSelect, onStreetAxisChange]);

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
      if (modeRef.current === 'render' && renderTestModeRef.current) {
        onRenderDrawingPtsChange?.(prev => [...prev, [e.data.textureX, e.data.textureY]]);
        return;
      }
      if (modeRef.current === 'render' && renderStreetEditModeRef.current) {
        // Los axis handles (streetaxis-*/streetaxismid-*) tienen su propio
        // manejo en pointerdown/pointerup — no tocar la selección de shape acá.
        const markerId = e.data.marker?.id;
        if (typeof markerId === 'string' && (markerId.startsWith('streetaxis-') || markerId.startsWith('streetaxismid-'))) {
          return;
        }
        // La unión visual (unionStreetPolygons) funde varias Rutas en un solo
        // marker/id, así que el id del marker clickeado ya no identifica la
        // shape — se busca por posición contra el ribbon de cada shape.
        const shapeId = findStreetShapeAtPoint([e.data.textureX, e.data.textureY], renderCalleShapesRef.current);
        onStreetShapeSelectRef.current?.(shapeId);
        return;
      }
      // Igual que arriba: clickear un marker también dispara este "click" del
      // viewer (además de "select-marker", que ya seleccionó el marker). Si
      // lo dejamos pasar, handleViewerClick lo interpreta como click en área
      // vacía y deselecciona (con activeTool "select") lo que acaba de
      // seleccionarse — el lote parpadea y hacen falta dos clicks.
      if (e.data.marker) return;
      onClickRef.current && onClickRef.current(e.data.textureX, e.data.textureY);
    });

    markersPluginRef.current.addEventListener('select-marker', ({ marker }) => {
      // En modo edición de Rutas la selección la maneja el listener de "click"
      // del viewer (arriba), por posición y no por id — acá solo hay que evitar
      // que caiga en onMarkerSelectRef de más abajo.
      if (renderStreetEditModeRef.current && typeof marker.id === 'string' && marker.id.startsWith('surfacetest-calle-')) {
        return;
      }
      // Mientras se está dibujando una manzana/calle, un click sobre un marker
      // (ej. una manzana ya pintada) no debe seleccionarlo — el "click" del
      // viewer (arriba) ya agrega el punto en esa misma posición.
      if (modeRef.current === 'render' && renderTestModeRef.current) return;
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

    const getSurfaceShape = (type, shapeId) => {
      const list = type === 'manzana' ? renderManzanaShapesRef.current : renderCalleShapesRef.current;
      return list.find(s => s.id === shapeId) ?? null;
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
        onMarkerSelectRef.current && onMarkerSelectRef.current('temp-pt-0');
        return;
      }

      const cornerEl = e.target.closest('[id^="psv-marker-edit-corner-"]');
      if (cornerEl) {
        e.stopPropagation(); 
        
        const parts = cornerEl.id.replace('psv-marker-edit-corner-', '').split('-');
        const index = parseInt(parts.pop(), 10);
        const markerId = parts.join('-');
        
        draggingCorner = { markerId, index, lastTexture: null };
        return;
      }

      const streetAxisEl = e.target.closest('[id^="psv-marker-streetaxis-"]');
      if (streetAxisEl) {
        e.stopPropagation();
        const parts = streetAxisEl.id.replace('psv-marker-streetaxis-', '').split('-');
        const index = parseInt(parts.pop(), 10);
        const shapeId = parts.join('-');
        const shape = getSurfaceShape('calle', shapeId);
        if (shape?.axis) {
          draggingStreetAxisPoint = { shapeId, index, axis: [...shape.axis] };
        }
        return;
      }

      const streetAxisMidEl = e.target.closest('[id^="psv-marker-streetaxismid-"]');
      if (streetAxisMidEl) {
        e.stopPropagation();
        const parts = streetAxisMidEl.id.replace('psv-marker-streetaxismid-', '').split('-');
        const segIndex = parseInt(parts.pop(), 10);
        const shapeId = parts.join('-');
        const shape = getSurfaceShape('calle', shapeId);
        if (shape?.axis) {
          const texture = getTextureCoordsFromEvent(e);
          const insertAt = segIndex + 1;
          const newAxis = [...shape.axis];
          newAxis.splice(insertAt, 0, texture ? [texture.textureX, texture.textureY] : shape.axis[segIndex]);
          draggingStreetAxisPoint = { shapeId, index: insertAt, axis: newAxis, isNew: true };
        }
        return;
      }

      const midpointEl = e.target.closest('[id^="psv-marker-edit-midpoint-"]');
      if (midpointEl) {
        e.stopPropagation(); 
        const parts = midpointEl.id.replace('psv-marker-edit-midpoint-', '').split('-');
        const index = parseInt(parts.pop(), 10);
        const markerId = parts.join('-');
        
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
        const markerId = markerEl.id.replace('psv-marker-', '');

        // Calibration points are only draggable with the Select tool or while
        // calibrating; in other tools let the click flow through (e.g. placing
        // new calibration points)
        if (markerId.startsWith('calib-') && activeToolRef.current !== 'select' && activeToolRef.current !== 'calibrate') {
          return;
        }

        // Mientras se está dibujando una manzana/calle (modo render), un click
        // sobre CUALQUIER marker — incluido el propio punto recién colocado —
        // no debe seleccionarlo ni hacer stopPropagation: el "click" del
        // viewer es el que agrega el siguiente vértice en esa posición. Si lo
        // interceptamos acá, el listener de click de PSV pierde ese evento y
        // el próximo punto termina agregándose en una posición vieja/errónea.
        if (modeRef.current === 'render' && renderTestModeRef.current) {
          return;
        }

        e.stopPropagation();

        onMarkerSelectRef.current && onMarkerSelectRef.current(markerId);

        const marker = markersPluginRef.current?.getMarker(markerId);
        if (marker && marker.isPoly() && activeToolRef.current === 'select' && !markerId.startsWith('ghost-')) {
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
      const isRenderSurfaceDrawing = modeRef.current === 'render'
        && renderTestModeRef.current
        && renderDrawingPtsRef.current.length >= 1;

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
          const tempMarker = markersPlugin.getMarker('temp-drawing');
          if (tempMarker && tempMarker.config.polylinePixels) {
            const pts = [...tempMarker.config.polylinePixels];
            
            let snapTx = texture.textureX;
            let snapTy = texture.textureY;

            if (pts.length - 1 >= 3) {
              const firstPtMarker = markersPlugin.getMarker('temp-pt-0');
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
              id: 'temp-drawing',
              polylinePixels: pts
            });
          }
        }

        if (isRenderSurfaceDrawing) {
          const tempSurfaceMarker = markersPlugin.getMarker('surfacetest-drawing');
          if (tempSurfaceMarker && tempSurfaceMarker.config.polylinePixels) {
            const pts = [...tempSurfaceMarker.config.polylinePixels];
            pts[pts.length - 1] = [texture.textureX, texture.textureY];
            markersPlugin.updateMarker({
              id: 'surfacetest-drawing',
              polylinePixels: pts
            });

            if (renderTestModeRef.current === 'calle') {
              const previewMarker = markersPlugin.getMarker('surfacetest-street-preview');
              if (previewMarker) {
                markersPlugin.updateMarker({
                  id: 'surfacetest-street-preview',
                  polygonPixels: buildStreetRibbon(pts, renderStreetWidthRef.current),
                });
              }
            }
          }
        }

        if (draggingStreetAxisPoint) {
          const { shapeId, index } = draggingStreetAxisPoint;
          const newAxis = [...draggingStreetAxisPoint.axis];
          newAxis[index] = [texture.textureX, texture.textureY];
          draggingStreetAxisPoint.axis = newAxis;
          const shape = getSurfaceShape('calle', shapeId);
          const width = shape?.width ?? renderStreetWidthRef.current;
          markersPlugin.updateMarker({
            id: `surfacetest-calle-${shapeId}`,
            polygonPixels: buildStreetRibbon(newAxis, width),
          });
          if (!draggingStreetAxisPoint.isNew) {
            markersPlugin.updateMarker({
              id: `streetaxis-${shapeId}-${index}`,
              position: { textureX: texture.textureX, textureY: texture.textureY },
            });
          }
        }

        if (draggingCorner) {
          const cornerMarkerId = `edit-corner-${draggingCorner.markerId}-${draggingCorner.index}`;
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
          if (draggingMarker.markerId.startsWith('calib-')) {
            onMarkerDragRef.current?.(draggingMarker.markerId, texture.textureX, texture.textureY);
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (draggingStreetAxisPoint) {
        const { shapeId, axis } = draggingStreetAxisPoint;
        onStreetAxisChangeRef.current?.(shapeId, axis);
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
        if (typeof m.id === 'string' && m.id.startsWith('edit-midpoint-')) {
           const parts = m.id.replace('edit-midpoint-', '').split('-');
           const index = parseInt(parts.pop(), 10);
           const polyId = parts.join('-');

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
        const id = `streetaxis-${shape.id}-${i}`;
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
        const id = `streetaxismid-${shape.id}-${i}`;
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
        const id = `surfacetest-calle-${shape.id}`;
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
          const id = `surfacetest-calle-union-${i}`;
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
        const id = `surfacetest-manzana-${shape.id}`;
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
      const id = 'surfacetest-drawing';
      const isStreetPath = renderTestMode === 'calle';
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

      if (isStreetPath) {
        const previewId = 'surfacetest-street-preview';
        plugin.addMarker({
          id: previewId,
          polygonPixels: buildStreetRibbon(ptsWithCursor, renderStreetWidth),
          svgStyle: { fill: colors.calle, stroke: '#ffa500', strokeWidth: '1.5', strokeDasharray: '4,4', fillOpacity: 0.6 },
          zIndex: 1,
        });
        newIds.push(previewId);
      }

      drawingPts.forEach((pt, i) => {
        const ptId = `surfacetest-drawing-pt-${i}`;
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
  }, [annotations, isReady, renderManzanaShapes, renderCalleShapes, renderColorMode, renderManzanaOpacity, renderDrawingPts, renderLayersVisible?.manzanas, renderLayersVisible?.calles, renderTestMode, renderStreetWidth, renderStreetEditMode, renderStreetEditTarget]);

  // Escape cancela el dibujo en curso, Enter lo cierra (>=3 puntos, o >=2 para calle/Ruta)
  useEffect(() => {
    if (mode !== 'render' || !renderTestMode) return;
    const handleKeyDown = (e) => {
      const minPts = renderTestMode === 'calle' ? 2 : 3;
      if (e.key === 'Escape') {
        onCancelRenderDrawing?.();
      } else if (e.key === 'Enter' && renderDrawingPts.length >= minPts) {
        onFinishRenderShape?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, renderTestMode, renderDrawingPts, onCancelRenderDrawing, onFinishRenderShape]);

  // Cursor crosshair mientras se dibuja una superficie en modo Render
  useEffect(() => {
    if (!viewerRef.current) return;
    if (mode === 'render' && renderTestMode) {
      viewerRef.current.container.style.cursor = 'crosshair';
    } else {
      viewerRef.current.container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    }
  }, [mode, renderTestMode, activeTool]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
