import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter, Cache } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

const TRANSITION = { speed: 600, rotation: true, effect: 'black' };
const HALF_TRANSITION_MS = Math.round(TRANSITION.speed / 2);

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
 * @returns {React.RefObject} viewerRef - ref para montar el contenedor del visor
 */
export function useViewer(viewerData, onMarkerSelect, onMarkerUnselect, preloadUrls = [], homePosition = null) {
  const viewerRef = useRef(null);
  const viewerInstanceRef = useRef(null);
  const currentPanoramaRef = useRef(null);
  const preloadedRef = useRef(new Set());
  const homePositionRef = useRef(homePosition);
  homePositionRef.current = homePosition;

  // Callbacks siempre frescos sin re-suscribir los listeners del visor.
  const selectRef = useRef(onMarkerSelect);
  const unselectRef = useRef(onMarkerUnselect);
  selectRef.current = onMarkerSelect;
  unselectRef.current = onMarkerUnselect;

  // Datos del panorama actual accesibles desde el efecto de ciclo de vida
  // sin tenerlo que recrear cuando cambian.
  const dataRef = useRef(viewerData);
  dataRef.current = viewerData;

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

    const mp = viewer.getPlugin(MarkersPlugin);
    mp.addEventListener('select-marker', ({ marker }) => selectRef.current?.(marker, mp));
    mp.addEventListener('unselect-marker', () => unselectRef.current?.());

    return () => {
      viewer.destroy();
      viewerInstanceRef.current = null;
      currentPanoramaRef.current = null;
    };
  }, [active]);

  // --- Cambio de etapa instantáneo ------------------------------------------
  // Reusa el mismo visor: solo intercambia la textura y los markers.
  useEffect(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer || !panoramaUrl) return;
    const mp = viewer.getPlugin(MarkersPlugin);

    if (panoramaUrl !== currentPanoramaRef.current) {
      const target = panoramaUrl;
      const targetMarkers = markers;
      currentPanoramaRef.current = target;
      // Fade-out de los markers actuales; se limpian cuando el fade termina
      // (ya son invisibles, es solo cleanup).
      const markersEl = viewerRef.current?.querySelector('.psv-markers');
      if (markersEl) { markersEl.style.transition = 'opacity 0.2s ease'; markersEl.style.opacity = '0'; }
      const fadeOutTimer = setTimeout(() => mp.clearMarkers(), 200);

      // 'panorama-loaded' dispara cuando PSV decodifica el blob (con cache ≈ t=0).
      // Esperamos HALF_TRANSITION_MS: el fade negro llega a su pico en ese punto,
      // así que los markers nuevos hacen fade-in junto con el nuevo panorama.
      let markersShown = false;
      let fadeInTimer = null;

      const showMarkers = () => {
        if (markersShown || currentPanoramaRef.current !== target) return;
        markersShown = true;
        mp.setMarkers(targetMarkers);
        if (markersEl) { markersEl.style.transition = 'opacity 0.25s ease'; markersEl.style.opacity = '1'; }
      };

      const onLoaded = () => {
        viewer.removeEventListener('panorama-loaded', onLoaded);
        fadeInTimer = setTimeout(showMarkers, HALF_TRANSITION_MS);
      };

      viewer.addEventListener('panorama-loaded', onLoaded);

      swapPanorama(viewer, target, homePositionRef.current).then((ok) => {
        viewer.removeEventListener('panorama-loaded', onLoaded);
        clearTimeout(fadeOutTimer);
        clearTimeout(fadeInTimer);
        if (!ok || currentPanoramaRef.current !== target) {
          mp.clearMarkers();
          if (markersEl) { markersEl.style.transition = ''; markersEl.style.opacity = ''; }
        } else {
          showMarkers(); // fallback si panorama-loaded no disparó
        }
      });
    } else if (viewer.state.ready) {
      // Misma etapa, solo cambiaron los markers. Solo si la textura ya cargó:
      // los polígonos necesitan las coordenadas de textura para renderizarse.
      // En el primer render los markers iniciales ya los aplica `withConfig`.
      mp.setMarkers(markers);
    }
  }, [panoramaUrl, markers]);

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
