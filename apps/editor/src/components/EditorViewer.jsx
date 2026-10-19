import { useEffect, useRef, useState } from 'react';
import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { annotationsToMarkers, markerHighlightUpdates } from '../utils/annotations';
import { isStreetAxisHandle, isSurfaceMarker } from '../utils/markerIds';
import { findStreetShapeAtPoint } from '../utils/streetPath';
import { useLatest } from '../hooks/useLatest';
import { midpointFnFor } from '../hooks/useDisplayAnnotations';
import { usePanoramaPointer } from '../hooks/usePanoramaPointer';
import { useSurfaceMarkers } from '../hooks/useSurfaceMarkers';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

let viewerInstanceCount = 0;

/**
 * Panorama 360 del editor (Photo Sphere Viewer). Pinta las anotaciones de la
 * vista panorama/render y reenvía clicks y selecciones a App. Las
 * interacciones de arrastre viven en usePanoramaPointer y las superficies del
 * modo Render en useSurfaceMarkers.
 */
export default function EditorViewer({
  mode,
  panoramaUrl,
  annotations,
  highlightedId,
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
  const annotationMarkerIdsRef = useRef([]);
  const [isReady, setIsReady] = useState(false);
  const [panoramaDims, setPanoramaDims] = useState(null);

  // Los listeners de PSV y de window se registran una sola vez: leen siempre
  // la última versión de props y callbacks desde acá.
  const latest = useLatest({
    mode, render, activeTool,
    onClick, onMarkerSelect, onPolygonUpdate, onMarkerDragEnd, onMarkerDrag, onPanoramaDimensions,
    // Mismo cálculo que useDisplayAnnotations, para que los handles que se
    // mueven en vivo al arrastrar caigan donde después los pinta React.
    midpointOf: midpointFnFor(mode, panoramaDims),
  });

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
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      setPanoramaDims(dims);
      latest.current.onPanoramaDimensions?.(dims);
    };
    img.src = panoramaUrl;
    return () => { cancelled = true; };
  }, [panoramaUrl, latest]);

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

    viewerRef.current.addEventListener('ready', () => {
      setIsReady(true);
      if (getPositionRef) getPositionRef.current = () => viewerRef.current?.getPosition() ?? null;
      onViewerReadyChange?.(true);
    });

    viewerRef.current.addEventListener('click', (e) => {
      const { mode: currentMode, render: r, onClick: handleClick } = latest.current;
      if (currentMode === 'render' && r.tool) {
        r.setDrawingPts(prev => [...prev, [e.data.textureX, e.data.textureY]]);
        return;
      }
      if (currentMode === 'render' && r.streetEditMode) {
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
      // Sin herramienta: un click sobre una manzana/calle la selecciona (para
      // borrarla con Supr). Igual sigue de largo como click en área vacía, así
      // se deselecciona el lote que hubiera y Supr no borra las dos cosas.
      if (currentMode === 'render') r.selectSurfaceAt([e.data.textureX, e.data.textureY]);
      handleClick?.(e.data.textureX, e.data.textureY);
    });

    markersPluginRef.current.addEventListener('select-marker', ({ marker }) => {
      const { mode: currentMode, render: r, onMarkerSelect: handleSelect } = latest.current;
      // Las superficies nunca se seleccionan como anotación: en Editar ruta la
      // calle se elige por posición (listener de "click" de arriba), y en el
      // resto de los casos son fondo.
      if (isSurfaceMarker(marker.id)) return;
      // Mientras se está dibujando una manzana/calle, un click sobre un marker
      // no debe seleccionarlo — el "click" del viewer (arriba) ya agrega el
      // punto en esa misma posición.
      if (currentMode === 'render' && r.tool) return;
      if (currentMode === 'render') r.clearSelection();
      handleSelect?.(marker.id);
    });

    return () => {
      if (getPositionRef) getPositionRef.current = null;
      onViewerReadyChange?.(false);
      viewerRef.current.destroy();
    };
  }, [panoramaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  usePanoramaPointer({ containerRef, viewerRef, markersPluginRef, latest });

  // Sync annotations to markers. Se agregan/quitan con addMarker/removeMarker
  // (en vez de setMarkers, que reemplaza TODO el set del plugin) para no
  // pisar las superficies de manzana/calle que pinta useSurfaceMarkers.
  const showLots = mode !== 'render' || render.layersVisible?.lotes;
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !annotations || !isReady) return;

    annotationMarkerIdsRef.current.forEach(id => {
      try { plugin.removeMarker(id); } catch { /* ya no existe */ }
    });
    annotationMarkerIdsRef.current = [];
    if (!showLots) return;

    const markers = annotationsToMarkers(annotations);
    markers.forEach(m => plugin.addMarker(m));
    annotationMarkerIdsRef.current = markers.map(m => m.id);
  }, [annotations, showLots, isReady]);

  // Resaltado del elemento con el mouse encima en el panel de Contenido. Va
  // aparte del rearmado de arriba para no recrear todos los marcadores en
  // cada hover; corre después de ese efecto, así que siempre pisa el marcador
  // recién creado.
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !isReady || !highlightedId) return;
    if (!annotationMarkerIdsRef.current.includes(highlightedId)) return;
    const annotation = annotations.find(a => a.id === highlightedId);
    const [marker] = annotation ? annotationsToMarkers([annotation]) : [];
    if (!marker) return;
    const { on, off } = markerHighlightUpdates(marker);
    plugin.updateMarker(on);
    return () => {
      try { plugin.updateMarker(off); } catch { /* lo sacó el rearmado */ }
    };
  }, [highlightedId, annotations, showLots, isReady]);

  useSurfaceMarkers({ markersPluginRef, isReady, annotations, render, latest });

  // Escape cancela el dibujo en curso, Enter lo cierra (>=3 puntos, o >=2 para calle/Ruta)
  const renderTool = render.tool;
  useEffect(() => {
    if (mode !== 'render' || !renderTool) return;
    const handleKeyDown = (e) => {
      const r = latest.current.render;
      if (e.key === 'Escape') r.cancelDrawing();
      else if (e.key === 'Enter' && r.canFinishShape) r.finishShape();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, renderTool, latest]);

  // Cursor: crosshair mientras se dibuja (lote o superficie de Render).
  useEffect(() => {
    if (!viewerRef.current) return;
    const drawing = (mode === 'render' && renderTool) || activeTool !== 'select';
    viewerRef.current.container.style.cursor = drawing ? 'crosshair' : 'default';
  }, [mode, renderTool, activeTool]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
