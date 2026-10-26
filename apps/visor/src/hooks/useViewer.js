import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Viewer, EquirectangularAdapter, Cache, SYSTEM } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { createLotOrbit } from '../lotOrbit.js';

const NO_MARKERS = [];
const TRANSITION = { speed: 600, rotation: true, effect: 'black' };
const STALL_TIMEOUT_MS = 45_000;
const MAX_PRELOAD_BYTES = 8 * 1024 * 1024;
// Gama baja: ancho máximo del panorama en la GPU. Un 12000×6000 ocupa ~290 MB
// y congela la órbita al entrar/salir; 6144 (~75 MB) sigue viéndose nítido en
// un celular. PSV achica la imagen al cargarla si pasa este tope, y markers y
// órbita siguen en píxeles de la imagen original (panoData), así que no cambian.
const LITE_MAX_TEXTURE_WIDTH = 6144;

const isLite = () => document.documentElement.classList.contains('perf-lite');

// SYSTEM es global de PSV y se carga al crear el primer Viewer: el tope va
// después, y solo baja (si el equipo ya soporta menos, se respeta).
function capTextureWidth() {
  if (!isLite() || SYSTEM.maxTextureWidth <= LITE_MAX_TEXTURE_WIDTH) return;
  SYSTEM.maxTextureWidth = LITE_MAX_TEXTURE_WIDTH;
  SYSTEM.__maxCanvasWidth = null;
}

function isSlowConnection() {
  const connection = navigator.connection;
  return Boolean(connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType));
}

function safelySetMarkers(plugin, markers) {
  const accepted = [];
  const seen = new Set();

  for (const marker of markers ?? []) {
    if (!marker?.id || seen.has(marker.id)) {
      console.warn('Visor: marker omitido por id ausente o duplicado', marker?.id);
      continue;
    }
    seen.add(marker.id);
    accepted.push(marker);
  }

  try {
    plugin.setMarkers(accepted);
    return true;
  } catch (error) {
    console.error('Visor: no se pudieron aplicar todos los markers', error);
    try { plugin.clearMarkers(); } catch (_) { /* viewer destruido */ }
    return false;
  }
}

// Con los mismos ids en el mismo orden (un filtro, los recomendados), PSV
// actualiza en el lugar solo los markers que cambiaron de referencia; si no,
// se reemplazan todos. setMarkers destruye y recrea cada elemento del DOM.
function syncMarkers(plugin, prev, next) {
  const sameIds = prev?.length === next.length && prev.every((m, i) => m.id === next[i].id);
  if (!sameIds) return safelySetMarkers(plugin, next);
  const changed = next.filter((m, i) => m !== prev[i]);
  try {
    changed.forEach((m, i) => plugin.updateMarker(m, i === changed.length - 1));
    return true;
  } catch (error) {
    console.warn('Visor: no se pudieron actualizar los markers, se reemplazan', error);
    return safelySetMarkers(plugin, next);
  }
}

/**
 * Referencias compartidas con PSV: el div donde se monta (`containerRef`), la
 * instancia del viewer y la órbita del lote. Las crea el componente y se las
 * pasa a useViewer y a los hooks que mueven la cámara o resaltan lotes.
 */
export function useViewerHandles() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const orbitRef = useRef(null);
  return useMemo(() => ({ containerRef, viewerRef, orbitRef }), []);
}

/**
 * Coordina una unica instancia de Photo Sphere Viewer por sesion panorama.
 * Cada seleccion invalida la anterior (latest-wins); ningun callback de una
 * instancia destruida puede confirmar o rechazar una etapa nueva.
 *
 * @param {ReturnType<typeof useViewerHandles>} handles
 * @param {object|null} viewerData - etapa a mostrar (null = sin panorama)
 * @param {object} options
 *   preloadCandidates, homePosition y los callbacks onMarkerSelect,
 *   onMarkerUnselect, onPositionChange, onStageReady, onStageError,
 *   onStageProgress, onLotPick (click en otro lote en órbita) y
 *   getOrbitInsets (lo que tapa la interfaz, para encuadrar en órbita).
 */
export function useViewer(handles, viewerData, { preloadCandidates = [], homePosition = null, ...callbacks } = {}) {
  const { containerRef, viewerRef, orbitRef } = handles;
  const sessionRef = useRef(0);
  const requestRef = useRef(0);
  const visibleStageRef = useRef(null);
  const visiblePanoramaRef = useRef(null);
  // Los eventos de PSV leen siempre los callbacks del último render.
  const callbacksRef = useRef(callbacks);
  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  });

  const stageId = viewerData?.stageId ?? viewerData?.panoramaUrl ?? null;
  const panoramaUrl = viewerData?.panoramaUrl ?? null;
  const markers = viewerData?.markers ?? NO_MARKERS;
  const orbitLots = viewerData?.orbitLots ?? null;
  const orbitFocus = viewerData?.orbitFocus ?? null;
  const orbitSurfaces = viewerData?.orbitSurfaces ?? null;
  const orbitPins = viewerData?.orbitPins ?? null;
  const requestNonce = viewerData?.requestNonce ?? 0;
  const active = Boolean(panoramaUrl);

  // Lo que se dibuja de la etapa. La carga lo aplica al terminar y, con la
  // etapa ya visible, los cambios se aplican aparte (solo lo que cambió) sin
  // pasar por setPanorama.
  const contentRef = useRef(null);
  useLayoutEffect(() => {
    contentRef.current = { markers, orbitLots, orbitFocus, orbitSurfaces, orbitPins };
  });
  const appliedRef = useRef({});
  const applyContent = (viewer) => {
    const next = contentRef.current;
    const applied = appliedRef.current;
    const orbit = orbitRef.current;
    let markersOk = applied.markersOk ?? true;
    if (next.markers !== applied.markers) {
      markersOk = syncMarkers(viewer.getPlugin(MarkersPlugin), applied.markers, next.markers);
    }
    if (next.orbitLots !== applied.orbitLots || next.orbitSurfaces !== applied.orbitSurfaces) {
      orbit?.setLots(next.orbitLots, next.orbitSurfaces);
    }
    if (next.orbitFocus !== applied.orbitFocus) orbit?.setFocus(next.orbitFocus);
    if (next.orbitPins !== applied.orbitPins) orbit?.setPins(next.orbitPins);
    appliedRef.current = { ...next, markersOk };
    return markersOk;
  };

  // El viewer se crea sin panorama: carga inicial y cambios comparten retry,
  // progreso, cancelacion y manejo de errores.
  useEffect(() => {
    if (!active || !containerRef.current) return undefined;

    const markersPlugin = MarkersPlugin.withConfig({ markers: [] });
    const viewer = new Viewer({
      container: containerRef.current,
      adapter: EquirectangularAdapter,
      plugins: [markersPlugin],
      navbar: false,
      defaultZoomLvl: 50,
      mousewheel: true,
      mousemove: true,
    });
    viewerRef.current = viewer;
    capTextureWidth();

    const orbit = createLotOrbit(viewer, {
      onPick: (id) => callbacksRef.current.onLotPick?.(id, orbit),
      getInsets: () => callbacksRef.current.getOrbitInsets?.() ?? null,
      onHeading: (yaw) => callbacksRef.current.onPositionChange?.(yaw),
      // Gama baja (devicePerf.js): sin mipmaps en la órbita.
      mipmaps: !isLite(),
    });
    orbitRef.current = orbit;

    const mp = viewer.getPlugin(MarkersPlugin);
    const handleSelect = ({ marker }) => callbacksRef.current.onMarkerSelect?.(marker, mp, viewer, orbit);
    const handleUnselect = () => callbacksRef.current.onMarkerUnselect?.();
    const handlePosition = (event) => callbacksRef.current.onPositionChange?.(event.position.yaw);

    mp.addEventListener('select-marker', handleSelect);
    mp.addEventListener('unselect-marker', handleUnselect);
    viewer.addEventListener('position-updated', handlePosition);

    return () => {
      sessionRef.current += 1;
      requestRef.current += 1;
      if (viewerRef.current === viewer) viewerRef.current = null;
      visibleStageRef.current = null;
      visiblePanoramaRef.current = null;
      appliedRef.current = {};
      if (orbitRef.current === orbit) orbitRef.current = null;
      try { orbit.destroy(); } catch (_) { /* cleanup idempotente */ }
      try { viewer.destroy(); } catch (_) { /* cleanup idempotente */ }
    };
  }, [active, containerRef, viewerRef, orbitRef]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !panoramaUrl || !stageId) return undefined;

    const sessionId = sessionRef.current;
    const requestId = ++requestRef.current;
    let settled = false;
    let stallTimer;

    const isCurrent = () => (
      viewerRef.current === viewer
      && sessionRef.current === sessionId
      && requestRef.current === requestId
    );

    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (!isCurrent() || settled) return;
        settled = true;
        // PSV no expone abort publico; esta API pertenece a la version fijada
        // en package-lock y es la misma que usa destroy/setPanorama.
        viewer.textureLoader?.abortLoading?.();
        viewer.hideError();
        callbacksRef.current.onStageError?.({
          stageId,
          code: 'stalled',
          message: 'La descarga dejó de avanzar. Revisá la conexión e intentá nuevamente.',
        });
      }, STALL_TIMEOUT_MS);
    };

    const handleProgress = (event) => {
      if (!isCurrent() || settled) return;
      resetStallTimer();
      callbacksRef.current.onStageProgress?.({ stageId, progress: event.progress });
    };

    viewer.addEventListener('load-progress', handleProgress);
    callbacksRef.current.onStageProgress?.({ stageId, progress: 0 });
    resetStallTimer();

    const samePanorama = panoramaUrl === visiblePanoramaRef.current;
    const sameStage = stageId === visibleStageRef.current;
    // La orbita dibuja con la textura y los lotes de la etapa visible: si
    // cambia, se corta sin animacion antes de tocar el panorama.
    if (!samePanorama || !sameStage) orbitRef.current?.exit({ immediate: true });
    if (samePanorama && !sameStage && homePosition) viewer.rotate(homePosition);
    const load = samePanorama
      ? Promise.resolve(true)
      : viewer.setPanorama(panoramaUrl, {
          transition: viewer.state.ready ? TRANSITION : false,
          showLoader: false,
          ...(homePosition ? { position: homePosition } : {}),
        });

    load.then((loaded) => {
      if (!isCurrent() || settled || loaded === false) return;
      settled = true;
      clearTimeout(stallTimer);
      viewer.removeEventListener('load-progress', handleProgress);

      // Etapa nueva: no se diffea contra lo de la anterior.
      if (!sameStage) appliedRef.current = {};
      const markersOk = applyContent(viewer);
      visiblePanoramaRef.current = panoramaUrl;
      visibleStageRef.current = stageId;
      callbacksRef.current.onStageProgress?.({ stageId, progress: 100 });
      callbacksRef.current.onStageReady?.({ stageId, markersOk });
    }).catch((error) => {
      if (!isCurrent() || settled || error?.name === 'AbortError') return;
      settled = true;
      clearTimeout(stallTimer);
      viewer.removeEventListener('load-progress', handleProgress);
      viewer.hideError();
      callbacksRef.current.onStageError?.({
        stageId,
        code: 'load_failed',
        message: 'No se pudo cargar esta etapa. Revisá la conexión e intentá nuevamente.',
      });
      console.error('Visor: error cargando panorama', error);
    });

    return () => {
      clearTimeout(stallTimer);
      viewer.removeEventListener('load-progress', handleProgress);
      if (requestRef.current === requestId) requestRef.current += 1;
    };
    // applyContent lee refs: no hace falta recargar cuando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, panoramaUrl, homePosition, requestNonce, viewerRef, orbitRef]);

  // Cambios de contenido con la etapa ya visible (filtros, recomendados).
  // Mientras carga no se toca nada: la carga aplica lo último al terminar.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !stageId || visibleStageRef.current !== stageId) return;
    applyContent(viewer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, markers, orbitLots, orbitFocus, orbitSurfaces, orbitPins, viewerRef]);

  // Precarga conservadora: una sola candidata pequena, durante idle y nunca
  // en conexiones lentas. El browser/CDN sigue siendo el cache principal.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!active || !viewer || isSlowConnection()) return undefined;
    const candidate = preloadCandidates.find((item) => (
      item?.url
      && item.url !== panoramaUrl
      && Number.isFinite(item.byteSize)
      && item.byteSize <= MAX_PRELOAD_BYTES
    ));
    if (!candidate) return undefined;

    let cancelled = false;
    const run = () => {
      if (cancelled || !viewerRef.current) return;
      viewer.textureLoader.preloadPanorama(candidate.url)
        .then((textureData) => viewer.adapter.disposeTexture(textureData))
        .catch(() => {});
    };
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(run, { timeout: 2000 })
      : window.setTimeout(run, 1000);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
      else clearTimeout(idleId);
    };
  }, [active, panoramaUrl, preloadCandidates, viewerRef]);

  useEffect(() => {
    Cache.maxItems = 2;
    Cache.ttl = 120;
  }, []);

}
