import { useState, useEffect, useCallback, useRef } from 'react';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { poiFromAnnotation } from '../annotations.js';
import { trackEvent, trackLotClick } from '../analytics.js';
import { focusMarker, focusMarkerById, flyToMarker } from '../camera.js';
import { getLotPanelInsets } from './usePanelLayout.js';
import { DEEP_LINK_LOT } from '../urlParams.js';
import { annId } from '../lotData.js';
import { perfMark } from '../perfTrace.js';

// Lo que está abierto: un lote (su ficha vive en LotPanel/LotFloat; `docked`
// = la cámara lo está orbitando) o un POI (`poi`, ficha en PoiPanel).
const PANEL_CLOSED = { isOpen: false, markerId: null, docked: false, poi: null };
const lotPanel = (id, docked = false) => ({ isOpen: true, markerId: id, docked, poi: null });
const poiPanel = (ann, id, stageNameById) => ({
  isOpen: true, markerId: id, docked: false, poi: poiFromAnnotation(ann, id, stageNameById),
});

// Markers que dibujan algo de un lote o POI pero no son clickeables por sí
// mismos: bordes, íconos, códigos de lote y manzanas/calles de fondo.
const isSyntheticMarker = (id) => id.includes('__border__') || id.includes('__icon') || id.includes('__badge') || id.startsWith('render-');

/**
 * Qué lote o POI está abierto y cómo se llega: tocándolo en la foto, en el
 * plano, en la órbita o eligiéndolo en la lista. Todos los caminos registran
 * el click y, en panorama, llevan la cámara al lote (órbita si se puede,
 * vuelo simple si no).
 *
 * @param {object} handles - useViewerHandles()
 */
export function useLotSelection(handles, { annotationsById, stageId, stageNameById, viewMode }) {
  const { viewerRef, orbitRef } = handles;
  const [panel, setPanel] = useState(PANEL_CLOSED);
  const closePanel = useCallback(() => setPanel(PANEL_CLOSED), []);

  const openPoi = useCallback((ann, id) => {
    trackEvent(stageId, 'poi_click', { type: 'poi', id });
    setPanel(poiPanel(ann, id, stageNameById));
  }, [stageId, stageNameById]);

  // Click en un marker del panorama.
  const handleMarkerSelect = useCallback((marker, markersPlugin, viewer, orbit) => {
    if (isSyntheticMarker(marker.id)) return;
    const ann = annotationsById[marker.id];
    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel?.();
      return;
    }
    if (ann?.type === 'poi') {
      openPoi(ann, marker.id);
      return;
    }
    trackLotClick(stageId, marker.id);
    // Órbita alrededor del lote; si no se puede (panorama parcial, movimiento
    // reducido), vuelo simple hasta el lote.
    const orbiting = Boolean(orbit?.select(marker.id));
    if (!orbiting) focusMarker(viewer, marker, getLotPanelInsets());
    setPanel(lotPanel(marker.id, orbiting));
  }, [annotationsById, stageId, openPoi]);

  // Click en el plano o en la vista satelital.
  const handleBlueprintSelect = useCallback((ann) => {
    const id = ann.uuid || ann.id;
    if (ann.type === 'poi') {
      openPoi(ann, id);
      return;
    }
    trackLotClick(stageId, id);
    setPanel(lotPanel(id));
  }, [stageId, openPoi]);

  // Click en otro lote estando ya en órbita (los markers de PSV están ocultos).
  const handleOrbitPick = useCallback((id, orbit) => {
    if (!orbit.select(id)) return;
    trackLotClick(stageId, id);
    setPanel(lotPanel(id, true));
  }, [stageId]);

  // Elegir un lote desde la lista: mismo recorrido que tocarlo en la foto.
  const selectLotById = useCallback((id) => {
    const ann = annotationsById[id];
    if (!ann || ann.type !== 'polygon') return;
    trackLotClick(stageId, id);
    let orbiting = false;
    const viewer = viewerRef.current;
    if (viewMode === 'panorama' && viewer) {
      orbiting = Boolean(orbitRef.current?.select(id));
      if (!orbiting) focusMarkerById(viewer, id, getLotPanelInsets());
    }
    setPanel(lotPanel(id, orbiting));
  }, [annotationsById, stageId, viewMode, viewerRef, orbitRef]);

  // "Cerca": lleva la cámara al lugar, sin abrir nada encima.
  const flyToPoi = useCallback((id) => {
    const viewer = viewerRef.current;
    if (viewMode !== 'panorama' || !viewer) return;
    setPanel(PANEL_CLOSED);
    flyToMarker(viewer, id, getLotPanelInsets());
  }, [viewMode, viewerRef]);

  // Hover en una fila de la lista (escritorio): resalta el lote en la foto sin
  // mover la cámara. Va directo al DOM de PSV (y a la órbita) en vez de pasar
  // por los markers: cambiarlos re-aplica la etapa entera.
  const hoveredLotRef = useRef(null);
  const hoverLot = useCallback((id) => {
    if (hoveredLotRef.current === id) return;
    hoveredLotRef.current = id;
    orbitRef.current?.highlight(id);
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.container.querySelectorAll('.is-row-hover').forEach((el) => el.classList.remove('is-row-hover'));
    if (!id) return;
    try {
      for (const marker of viewer.getPlugin(MarkersPlugin).getMarkers()) {
        const mid = String(marker.id);
        if (mid === id || mid.startsWith(`${id}__border__`)) marker.domElement?.classList.add('is-row-hover');
      }
    } catch (_) { /* sin markers todavía */ }
  }, [orbitRef, viewerRef]);

  // Cerrar la ficha (X, Esc, envío del form, cambio de etapa) vuelve al dron.
  useEffect(() => {
    perfMark(`react: ficha ${panel.isOpen ? 'abierta' : 'cerrada'} (commit)`);
    if (!panel.isOpen) orbitRef.current?.exit();
  }, [panel.isOpen, orbitRef]);

  return {
    panel,
    selectedLotId: panel.isOpen && !panel.poi ? panel.markerId : null,
    closePanel,
    handleMarkerSelect,
    handleBlueprintSelect,
    handleOrbitPick,
    selectLotById,
    flyToPoi,
    hoverLot,
  };
}

/**
 * Link por lote (?lote=slug|id): se abre una sola vez, apenas la etapa de
 * entrada terminó de cargar.
 */
export function useDeepLinkLot({ ready, annotations, openLot }) {
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current || !ready) return undefined;
    doneRef.current = true;
    if (!DEEP_LINK_LOT) return undefined;
    const ann = annotations.find((a) => a.type === 'polygon' && (a.slug === DEEP_LINK_LOT || annId(a) === DEEP_LINK_LOT));
    if (!ann) return undefined;
    // Sin cleanup a propósito: corre una sola vez y el lote se abre aunque el
    // efecto se vuelva a evaluar en el medio.
    setTimeout(() => openLot(annId(ann)), 400);
    return undefined;
  }, [ready, annotations, openLot]);
}
