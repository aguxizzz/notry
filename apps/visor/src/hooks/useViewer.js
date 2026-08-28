import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter, Cache } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

const TRANSITION = { speed: 600, rotation: true, effect: 'black' };

/**
 * Cambia el panorama del visor con transición white + barrido a la derecha.
 * Pasa como posición destino el yaw actual + 0.4 rad para que PSV anime
 * la cámara hacia la derecha durante el fade.
 *
 * @returns {Promise<boolean>} true si el panorama quedó cargado.
 */
async function swapPanorama(viewer, url, homePosition = null) {
  const { yaw } = viewer.getPosition();
  const targetYaw = homePosition?.yaw ?? yaw + 0.6;
  const targetPitch = homePosition?.pitch ?? 0;
  const opts = {
    transition: TRANSITION,
    showLoader: false,
    position: { yaw: targetYaw, pitch: targetPitch },
  };
  try {
    await viewer.setPanorama(url, opts);
    return true;
  } catch (_) {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      Cache.add(url, url, await res.blob());
      await viewer.setPanorama(url, opts);
      return true;
    } catch (_e) {
      return false;
    }
  }
}

/**
 * Custom hook para inicializar el visor 360° de Photo Sphere Viewer.
 *
 * El visor se crea UNA sola vez al entrar en modo panorama y se mantiene vivo
 * mientras se cambia de etapa: el cambio se hace con `setPanorama` (sin recrear
 * el contexto WebGL, sin transición ni loader) para que sea instantáneo.
 * Además precarga los panoramas de todas las etapas en la cache de PSV para que
 * el primer cambio a cada una tampoco espere descarga de red.
 *
 * @param {{ panoramaUrl: string, markers: Array }} viewerData
 * @param {Function} onMarkerSelect   - (marker, markersPlugin) => void
 * @param {Function} onMarkerUnselect - () => void
 * @param {string[]} preloadUrls      - URLs de panorama de todas las etapas a precargar
 * @param {Function|null} onPositionChange - (yaw: number) => void, llamado en cada cambio de ángulo
 * @param {Function|null} onStageReady - (stageId: string) => void, llamado cuando panorama y markers están listos
 * @param {Function|null} onStageError - ({ stageId, message }) => void, llamado cuando falla una etapa
 * @returns {React.RefObject} viewerRef - ref para montar el contenedor del visor
 */
export function useViewer(
  viewerData,
  onMarkerSelect,
  onMarkerUnselect,
  preloadUrls = [],
  homePosition = null,
  onPositionChange = null,
  onStageReady = null,
  onStageError = null,
) {
  const viewerRef = useRef(null);
  const viewerInstanceRef = useRef(null);
  const currentPanoramaRef = useRef(null);
  const currentStageRef = useRef(null);
  const latestTransitionRef = useRef(0);
  const transitionQueueRef = useRef(Promise.resolve());
  const viewerReadyPromiseRef = useRef(Promise.resolve());
  const resolveViewerReadyRef = useRef(null);
  const preloadedRef = useRef(new Set());
  const homePositionRef = useRef(homePosition);
  homePositionRef.current = homePosition;

  // Callbacks siempre frescos sin re-suscribir los listeners del visor.
  const selectRef = useRef(onMarkerSelect);
  const unselectRef = useRef(onMarkerUnselect);
  const positionRef = useRef(onPositionChange);
  const stageReadyRef = useRef(onStageReady);
  const stageErrorRef = useRef(onStageError);
  selectRef.current = onMarkerSelect;
  unselectRef.current = onMarkerUnselect;
  positionRef.current = onPositionChange;
  stageReadyRef.current = onStageReady;
  stageErrorRef.current = onStageError;

  // Datos del panorama actual accesibles desde el efecto de ciclo de vida
  // sin tenerlo que recrear cuando cambian.
  const dataRef = useRef(viewerData);
  dataRef.current = viewerData;

  // La etapa identifica el contenido completo. Dos etapas pueden compartir
  // panoramaUrl pero tener markers, blueprint o posición diferentes.
  const stageId = viewerData?.stageId ?? viewerData?.panoramaUrl ?? null;
  const requestNonce = viewerData?.requestNonce ?? 0;
  const panoramaUrl = viewerData?.panoramaUrl ?? null;
  const markers = viewerData?.markers ?? [];
  const active = !!panoramaUrl;

  // --- Ciclo de vida ---------------------------------------------------------
  // Crear al entrar en modo panorama, destruir al salir (p. ej. blueprint).
  // Depende SOLO de `active`: cambiar de etapa no vuelve a ejecutar este efecto,
  // así que el visor (y su contexto WebGL) nunca se recrea entre etapas.
  useEffect(() => {
    if (!active || !viewerRef.current) return;

    const data = dataRef.current;
    const markersPlugin = MarkersPlugin.withConfig({
      markers: data.markers ?? [],
    });

    const viewer = new Viewer({
      container: viewerRef.current,
      panorama: data.panoramaUrl,
      adapter: EquirectangularAdapter,
      plugins: [markersPlugin],
      navbar: false,
      defaultZoomLvl: 50,
      ...(homePosition ? { defaultYaw: homePosition.yaw, defaultPitch: homePosition.pitch } : {}),
      mousewheel: true,
      mousemove: true,
    });

    viewerInstanceRef.current = viewer;
    currentPanoramaRef.current = data.panoramaUrl;
    currentStageRef.current = data.stageId ?? data.panoramaUrl;

    let initialReady = false;
    let initialReadyTimeout = null;
    viewerReadyPromiseRef.current = new Promise((resolve) => {
      resolveViewerReadyRef.current = () => {
        if (initialReady) return;
        initialReady = true;
        if (initialReadyTimeout) clearTimeout(initialReadyTimeout);
        resolve();
      };
    });
    // No dejamos bloqueada la cola si el proveedor falla sin emitir el evento.
    initialReadyTimeout = setTimeout(() => {
      if (initialReady) return;
      resolveViewerReadyRef.current?.();
      stageErrorRef.current?.({
        stageId: data.stageId ?? data.panoramaUrl,
        message: 'El panorama inicial tardó demasiado en cargar. Revisá la conexión e intentá nuevamente.',
      });
    }, 10000);

    const mp = viewer.getPlugin(MarkersPlugin);
    mp.addEventListener('select-marker', ({ marker }) => selectRef.current?.(marker, mp));
    mp.addEventListener('unselect-marker', () => unselectRef.current?.());
    viewer.addEventListener('position-updated', (e) => positionRef.current?.(e.position.yaw));

    // MarkersPlugin recibe la configuración inicial, pero los polígonos
    // basados en píxeles necesitan que la textura ya esté cargada para poder
    // proyectarse correctamente. Reaplicarlos aquí cubre la primera carga
    // cuando el visor todavía no estaba ready en el efecto siguiente.
    const onInitialPanoramaLoaded = () => {
      resolveViewerReadyRef.current?.();
      const latest = dataRef.current;
      const latestStageId = latest?.stageId ?? latest?.panoramaUrl;
      if (latestStageId === currentStageRef.current) {
        mp.setMarkers(latest?.markers ?? []);
        stageReadyRef.current?.(latestStageId);
      }
      viewer.removeEventListener('panorama-loaded', onInitialPanoramaLoaded);
    };
    viewer.addEventListener('panorama-loaded', onInitialPanoramaLoaded);
    if (viewer.state.ready) onInitialPanoramaLoaded();

    return () => {
      viewer.removeEventListener('panorama-loaded', onInitialPanoramaLoaded);
      if (initialReadyTimeout) clearTimeout(initialReadyTimeout);
      resolveViewerReadyRef.current?.();
      resolveViewerReadyRef.current = null;
      viewer.destroy();
      viewerInstanceRef.current = null;
      currentPanoramaRef.current = null;
      currentStageRef.current = null;
    };
  }, [active]);

  // --- Cambio de etapa instantáneo ------------------------------------------
  // Reusa el mismo visor: solo intercambia la textura y los markers.
  useEffect(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer || !panoramaUrl) return;
    const mp = viewer.getPlugin(MarkersPlugin);
    const target = panoramaUrl;
    const targetStageId = stageId;
    const transitionId = ++latestTransitionRef.current;

    // Encadenamos las operaciones para que Photo Sphere Viewer nunca tenga
    // dos setPanorama concurrentes. Las solicitudes intermedias se descartan
    // si ya no representan la última selección del usuario.
    transitionQueueRef.current = transitionQueueRef.current
      .catch(() => {})
      .then(async () => {
        // La primera navegación no compite con la carga iniciada por el
        // constructor de Photo Sphere Viewer.
        await viewerReadyPromiseRef.current;
        if (transitionId !== latestTransitionRef.current) return;

        const sameStage = targetStageId === currentStageRef.current;
        const samePanorama = target === currentPanoramaRef.current;

        if (sameStage && samePanorama) {
          if (viewer.state.ready) {
            mp.setMarkers(markers);
            stageReadyRef.current?.(targetStageId);
          }
          return;
        }

        // Fade-out de los markers actuales; se limpian antes de iniciar la
        // nueva textura para no mezclar polígonos entre etapas.
        const markersEl = viewerRef.current?.querySelector('.psv-markers');
        if (markersEl) {
          markersEl.style.transition = 'opacity 0.2s ease';
          markersEl.style.opacity = '0';
        }
        const fadeOutTimer = setTimeout(() => mp.clearMarkers(), 200);

        // swapPanorama resuelve después de que Photo Sphere Viewer terminó de
        // cargar la textura. Recién después aplicamos los markers; escuchar
        // un evento global aquí podría capturar todavía la carga de la etapa
        // anterior si el usuario cambia durante la carga inicial.
        const ok = await swapPanorama(viewer, target, homePositionRef.current);
        clearTimeout(fadeOutTimer);

        // Aunque la solicitud haya quedado obsoleta, la operación de PSV pudo
        // haber terminado y dejar esa textura visible. Registramos la realidad
        // del visor antes de decidir si debemos pintar sus markers, para que
        // la siguiente selección fuerce el regreso a la etapa correcta.
        if (ok) {
          currentPanoramaRef.current = target;
          currentStageRef.current = targetStageId;
        }

        if (transitionId !== latestTransitionRef.current) {
          if (markersEl) {
            markersEl.style.transition = '';
            markersEl.style.opacity = '';
          }
          return;
        }

        if (!ok) {
          currentPanoramaRef.current = null;
          currentStageRef.current = null;
          mp.clearMarkers();
          if (markersEl) {
            markersEl.style.transition = '';
            markersEl.style.opacity = '';
          }
          stageErrorRef.current?.({
            stageId: targetStageId,
            message: 'No se pudo cargar esta etapa. Revisá la conexión e intentá nuevamente.',
          });
          return;
        }

        mp.setMarkers(markers);
        stageReadyRef.current?.(targetStageId);
        if (markersEl) {
          markersEl.style.transition = 'opacity 0.25s ease';
          markersEl.style.opacity = '1';
        }
      });
  }, [stageId, panoramaUrl, markers, requestNonce]);

  // --- Precarga de etapas ----------------------------------------------------
  // Llena la cache de blobs de PSV (clave = URL, la misma que usa setPanorama)
  // para TODAS las etapas —incluida la inicial— con un fetch INDEPENDIENTE.
  //
  // Es importante precargar también la etapa inicial: el FileLoader interno que
  // usa setPanorama falla ("Failed to fetch") en el visor reutilizado por el
  // abortLoading() que dispara en cada cambio. Al tener el blob ya en cache,
  // setPanorama lo resuelve directo y nunca recurre a ese FileLoader roto.
  useEffect(() => {
    if (!active || !preloadUrls?.length) return;

    let cancelled = false;
    const controller = new AbortController();
    // Pequeño respiro para no competir con la carga del panorama inicial.
    const id = setTimeout(() => {
      if (cancelled) return;
      for (const url of preloadUrls) {
        if (!url || preloadedRef.current.has(url)) continue;
        fetch(url, { signal: controller.signal })
          .then((res) => (res.ok ? res.blob() : null))
          .then((blob) => {
            if (blob && !cancelled) {
              Cache.add(url, url, blob);
              preloadedRef.current.add(url);
            }
          })
          .catch(() => {});
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(id);
      controller.abort();
    };
  }, [active, preloadUrls]);

  return viewerRef;
}
