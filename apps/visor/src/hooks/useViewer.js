import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter, Cache } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

const TRANSITION = { speed: 600, rotation: true, effect: 'black' };
const STALL_TIMEOUT_MS = 45_000;
const MAX_PRELOAD_BYTES = 8 * 1024 * 1024;

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

/**
 * Coordina una unica instancia de Photo Sphere Viewer por sesion panorama.
 * Cada seleccion invalida la anterior (latest-wins); ningun callback de una
 * instancia destruida puede confirmar o rechazar una etapa nueva.
 */
export function useViewer(
  viewerData,
  onMarkerSelect,
  onMarkerUnselect,
  preloadCandidates = [],
  homePosition = null,
  onPositionChange = null,
  onStageReady = null,
  onStageError = null,
  onStageProgress = null,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const sessionRef = useRef(0);
  const requestRef = useRef(0);
  const visibleStageRef = useRef(null);
  const visiblePanoramaRef = useRef(null);
  const callbacksRef = useRef({});

  callbacksRef.current = {
    onMarkerSelect,
    onMarkerUnselect,
    onPositionChange,
    onStageReady,
    onStageError,
    onStageProgress,
  };

  const stageId = viewerData?.stageId ?? viewerData?.panoramaUrl ?? null;
  const panoramaUrl = viewerData?.panoramaUrl ?? null;
  const markers = viewerData?.markers ?? [];
  const requestNonce = viewerData?.requestNonce ?? 0;
  const active = Boolean(panoramaUrl);

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

    const mp = viewer.getPlugin(MarkersPlugin);
    const handleSelect = ({ marker }) => callbacksRef.current.onMarkerSelect?.(marker, mp);
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
      try { viewer.destroy(); } catch (_) { /* cleanup idempotente */ }
    };
  }, [active]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !panoramaUrl || !stageId) return undefined;

    const sessionId = sessionRef.current;
    const requestId = ++requestRef.current;
    const mp = viewer.getPlugin(MarkersPlugin);
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

      const markersOk = safelySetMarkers(mp, markers);
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
  }, [stageId, panoramaUrl, markers, homePosition, requestNonce]);

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
  }, [active, panoramaUrl, preloadCandidates]);

  useEffect(() => {
    Cache.maxItems = 2;
    Cache.ttl = 120;
  }, []);

  return containerRef;
}
