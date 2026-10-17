import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LAYERS_VISIBLE, addDrawnShape, findShape, findSurfaceAtPoint, hasAnyShape, hasStreetPaths,
  minPointsFor, normalizeRenderSurfaces, removeShape, streetRibbon, withStreetAxis, withStreetWidth,
} from '../utils/renderSurfaces';

const DEFAULT_STREET_WIDTH = 56;

/**
 * Estado del modo Render (manzanas y calles sobre el panorama) y todas sus
 * acciones. Devuelve un solo objeto `render` que se pasa entero a Toolbar y
 * EditorViewer.
 *
 * Las shapes (manzanas/calles) entran al historial de undo/redo:
 * `onBeforeChange` se llama justo antes de cada cambio confirmado (crear,
 * editar eje/ancho, limpiar) para que App guarde el snapshot. Por eso
 * `manzanas`/`calles` y sus setters se exponen también para useHistory.
 */
export function useRenderSurfaces({ homography, onBeforeChange }) {
  const [manzanas, setManzanas] = useState([]);
  const [calles, setCalles] = useState([]);
  const [layersVisible, setLayersVisible] = useState(DEFAULT_LAYERS_VISIBLE);
  const [colorMode, setColorMode] = useState('light');
  const [manzanaOpacity, setManzanaOpacity] = useState(1);

  // Herramienta de dibujo activa ('manzana' | 'calle' | null) y trazo en curso
  // ([[textureX, textureY], ...]).
  const [tool, setToolState] = useState(null);
  const [drawingPts, setDrawingPts] = useState([]);
  // Ancho para las calles NUEVAS (el de una calle ya trazada vive en su shape).
  const [streetWidth, setStreetWidth] = useState(DEFAULT_STREET_WIDTH);
  // Edición de eje post-creación: se elige una calle y se arrastran/agregan
  // puntos de su eje; el contorno se regenera en cada cambio.
  const [streetEditMode, setStreetEditMode] = useState(false);
  const [streetEditTarget, setStreetEditTarget] = useState(null);
  // Shape elegida para borrar ({ kind, id }), fuera de dibujo y de Editar ruta.
  const [selectedRef, setSelectedRef] = useState(null);

  // El slider de ancho dispara onChange en cada tick del arrastre: solo el
  // primer tick del gesto guarda snapshot, así un Ctrl+Z revierte el arrastre
  // entero. App llama a endWidthDrag() en pointerup.
  const isDraggingWidthRef = useRef(false);

  const surfaces = useMemo(() => ({
    manzanas, calles, colorMode, manzanaOpacity, layersVisible,
  }), [manzanas, calles, colorMode, manzanaOpacity, layersVisible]);

  // Si un undo/redo o un Limpiar se llevó la shape, la selección se cae sola.
  const selectedSurface = findShape({ manzanas, calles }, selectedRef) ? selectedRef : null;

  const resetDrawing = () => {
    setToolState(null);
    setDrawingPts([]);
  };

  const setTool = (next) => {
    setToolState(next);
    setDrawingPts([]);
    setStreetEditMode(false);
    setStreetEditTarget(null);
    setSelectedRef(null);
  };

  const toggleTool = kind => setTool(tool === kind ? null : kind);

  const finishShape = () => {
    if (!tool) return;
    const next = addDrawnShape({ manzanas, calles }, {
      kind: tool,
      drawingPts,
      streetWidth,
      homography,
      id: `test-${tool}-${Date.now()}`,
    });
    if (!next) return;
    onBeforeChange();
    setManzanas(next.manzanas);
    setCalles(next.calles);
    resetDrawing();
  };

  const clearShapes = () => {
    if (!hasAnyShape({ manzanas, calles })) return;
    onBeforeChange();
    setManzanas([]);
    setCalles([]);
    setDrawingPts([]);
    setStreetEditTarget(null);
  };

  const toggleStreetEditMode = () => {
    setStreetEditMode(v => !v);
    setStreetEditTarget(null);
    setSelectedRef(null);
  };

  // Click sobre el panorama (sin herramienta ni Editar ruta): elige la shape
  // de arriba en ese punto, o limpia la selección. Devuelve si encontró algo.
  const selectSurfaceAt = (point) => {
    const hit = findSurfaceAtPoint({ manzanas, calles }, point, layersVisible);
    setSelectedRef(hit);
    return Boolean(hit);
  };

  // Lo que borra Supr: en Editar ruta, la calle en edición; si no, la shape
  // seleccionada. Devuelve false si no había nada, para que App siga con el
  // borrado de lotes.
  const deleteSelected = () => {
    const ref = streetEditMode
      ? (streetEditTarget ? { kind: 'calle', id: streetEditTarget } : null)
      : selectedSurface;
    const next = removeShape({ manzanas, calles }, ref);
    if (!next) return false;
    onBeforeChange();
    setManzanas(next.manzanas);
    setCalles(next.calles);
    setSelectedRef(null);
    setStreetEditTarget(null);
    return true;
  };

  // Se llama una vez por gesto de arrastre (al soltar, ver EditorViewer), así
  // que cada llamada es un commit atómico para el historial.
  const setStreetAxis = (shapeId, axis) => {
    onBeforeChange();
    setCalles(prev => withStreetAxis(prev, shapeId, axis, homography));
  };

  const setEditTargetWidth = (width) => {
    if (!streetEditTarget) return;
    if (!isDraggingWidthRef.current) {
      isDraggingWidthRef.current = true;
      onBeforeChange();
    }
    setCalles(prev => withStreetWidth(prev, streetEditTarget, width, homography));
  };

  // Estable: App lo usa como dependencia del listener de pointerup.
  const endWidthDrag = useCallback(() => { isDraggingWidthRef.current = false; }, []);

  const toggleLayer = (key) => {
    setLayersVisible(v => ({ ...v, [key]: !v[key] }));
    setSelectedRef(null);
  };

  // Carga lo que vino del backend (no entra al historial).
  const load = (raw) => {
    const loaded = normalizeRenderSurfaces(raw);
    setManzanas(loaded.manzanas);
    setCalles(loaded.calles);
    setColorMode(loaded.colorMode);
    setManzanaOpacity(loaded.manzanaOpacity);
    setLayersVisible(loaded.layersVisible);
    return loaded;
  };

  return {
    // shapes + setters (historial)
    manzanas, calles, setManzanas, setCalles,
    surfaces,
    hasShapes: hasAnyShape({ manzanas, calles }),
    hasStreetPaths: hasStreetPaths(calles),
    load,
    // dibujo
    tool, setTool, toggleTool,
    drawingPts, setDrawingPts,
    canFinishShape: Boolean(tool) && drawingPts.length >= minPointsFor(tool),
    finishShape,
    cancelDrawing: resetDrawing,
    resetDrawing,
    clearShapes,
    // selección / borrado puntual
    selectedSurface, selectSurfaceAt, clearSelection: () => setSelectedRef(null),
    deleteSelected,
    // calles
    streetWidth, setStreetWidth,
    streetEditMode, toggleStreetEditMode,
    streetEditTarget, selectStreet: setStreetEditTarget,
    editTargetWidth: calles.find(s => s.id === streetEditTarget)?.width ?? streetWidth,
    setEditTargetWidth, endWidthDrag,
    setStreetAxis,
    ribbonFor: (axis, width) => streetRibbon(axis, width, homography),
    // apariencia
    layersVisible, toggleLayer,
    colorMode, setColorMode,
    manzanaOpacity, setManzanaOpacity,
  };
}
