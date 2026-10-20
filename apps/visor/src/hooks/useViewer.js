import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter, Cache } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { createLotOrbit } from '../lotOrbit.js';

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

const FOCUS_DURATION_MS = 1100;
// Cuanto del area libre (la que no tapa la ficha) ocupa el lote al terminar.
const FOCUS_FILL = 0.55;
// Mismo breakpoint que el layout de la ficha en index.css: modal centrado
// (escritorio / celular apaisado) vs hoja inferior (celular).
export const CENTERED_PANEL_QUERY = '(min-width: 641px), (min-width: 480px) and (max-height: 500px)';

/**
 * Vuela la camara hasta un marker poligonal (lote) y hace zoom para encuadrarlo.
 * El destino queda descentrado hacia la zona que la ficha no tapa: a la
 * izquierda del modal en escritorio, arriba de la hoja inferior en celular.
 * `insets` ({ left, right, top, bottom } en px) reemplaza esa suposicion
 * cuando la ficha vive en otro lado (el panel lateral).
 * Nunca aleja el zoom: si el usuario ya estaba mas cerca, solo reencuadra.
 */
export function focusMarker(viewer, marker, insets = null) {
  const ring = marker?.definition?.[0];
  const center = marker?.state?.position;
  if (!viewer || !center || !Array.isArray(ring) || ring.length < 3) return;

  const { dataHelper } = viewer;
  const toUnit = (yaw, pitch) => dataHelper.sphericalCoordsToVector3({ yaw, pitch }).normalize();
  const centerDir = toUnit(center.yaw, center.pitch);

  // Diametro angular del lote: sirve igual cerca del nadir, donde medir en
  // yaw/pitch se deforma.
  let radius = 0;
  for (const [yaw, pitch] of ring) radius = Math.max(radius, centerDir.angleTo(toUnit(yaw, pitch)));
  const lotSize = Math.min(Math.PI / 2, radius * 2);

  // Fraccion del viewport que queda libre y hacia donde se corre el lote.
  let freeWidth; let freeHeight; let shiftX; let shiftY;
  if (insets) {
    const { width, height } = viewer.state.size;
    const { left = 0, right = 0, top = 0, bottom = 0 } = insets;
    freeWidth = Math.max(0.1, (width - left - right) / width);
    freeHeight = Math.max(0.1, (height - top - bottom) / height);
    shiftX = (right - left) / (2 * width);
    shiftY = (bottom - top) / (2 * height);
  } else {
    const centeredPanel = window.matchMedia(CENTERED_PANEL_QUERY).matches;
    freeWidth = centeredPanel ? 0.3 : 0.85;
    freeHeight = centeredPanel ? 0.7 : 0.3;
    shiftX = centeredPanel ? 0.32 : 0;
    shiftY = centeredPanel ? 0 : 0.3;
  }

  const toDeg = 180 / Math.PI;
  const vFovNeeded = Math.max(
    (lotSize / (freeHeight * FOCUS_FILL)) * toDeg,
    dataHelper.hFovToVFov(Math.min(170, (lotSize / (freeWidth * FOCUS_FILL)) * toDeg)),
  );
  const zoom = Math.max(
    viewer.getZoomLevel(),
    dataHelper.fovToZoomLevel(Math.min(viewer.config.maxFov, Math.max(viewer.config.minFov, vFovNeeded))),
  );

  // Corrimiento en pantalla (unidades de tangente) que debe tener el lote
  // respecto del centro: negativo en X = a la izquierda, positivo en Y = arriba.
  const vFov = dataHelper.zoomLevelToFov(zoom);
  const offsetX = -shiftX * 2 * Math.tan((dataHelper.vFovToHFov(vFov) / toDeg) / 2);
  const offsetY = shiftY * 2 * Math.tan((vFov / toDeg) / 2);

  // Se busca la direccion de camara que proyecta el centro del lote en ese
  // punto. Los ejes de pantalla dependen de la propia camara, asi que se
  // itera; converge en pocas vueltas.
  let target = { yaw: center.yaw, pitch: center.pitch };
  for (let i = 0; i < 8; i += 1) {
    const right = toUnit(target.yaw + Math.PI / 2, 0);
    const up = toUnit(target.yaw, target.pitch + Math.PI / 2);
    const dir = centerDir.clone()
      .addScaledVector(right, -offsetX)
      .addScaledVector(up, -offsetY)
      .normalize();
    target = dataHelper.vector3ToSphericalCoords(dir);
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    viewer.rotate(target);
    viewer.zoom(zoom);
    return;
  }
  viewer.animate({ yaw: target.yaw, pitch: target.pitch, zoom, speed: FOCUS_DURATION_MS });
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
  onLotPick = null,
  getOrbitInsets = null,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const orbitRef = useRef(null);
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
    onLotPick,
    getOrbitInsets,
  };

  const stageId = viewerData?.stageId ?? viewerData?.panoramaUrl ?? null;
  const panoramaUrl = viewerData?.panoramaUrl ?? null;
  const markers = viewerData?.markers ?? [];
  const orbitLots = viewerData?.orbitLots ?? null;
  const orbitSurfaces = viewerData?.orbitSurfaces ?? null;
  const orbitPins = viewerData?.orbitPins ?? null;
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

    const orbit = createLotOrbit(viewer, {
      onPick: (id) => callbacksRef.current.onLotPick?.(id, orbit),
      getInsets: () => callbacksRef.current.getOrbitInsets?.() ?? null,
      onHeading: (yaw) => callbacksRef.current.onPositionChange?.(yaw),
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
      if (orbitRef.current === orbit) orbitRef.current = null;
      try { orbit.destroy(); } catch (_) { /* cleanup idempotente */ }
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

      const markersOk = safelySetMarkers(mp, markers);
      orbitRef.current?.setLots(orbitLots, orbitSurfaces);
      orbitRef.current?.setPins(orbitPins);
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
  }, [stageId, panoramaUrl, markers, orbitLots, orbitSurfaces, orbitPins, homePosition, requestNonce]);

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

  return { containerRef, orbitRef, viewerRef };
}
