import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

/**
 * Custom hook para inicializar el visor 360° de Photo Sphere Viewer.
 * Monta el visor sobre el div referenciado y llama al callback onMarkerSelect
 * cuando el usuario hace click en un marcador.
 *
 * @param {{ panoramaUrl: string, markers: Array }} viewerData
 * @param {Function} onMarkerSelect - ({ markerId, annotation }) => void
 * @param {Function} onMarkerUnselect - () => void
 * @returns {React.RefObject} viewerRef - ref para montar el contenedor del visor
 */
export function useViewer(viewerData, onMarkerSelect, onMarkerUnselect) {
  const viewerRef = useRef(null);
  const viewerInstanceRef = useRef(null);

  useEffect(() => {
    if (!viewerRef.current || !viewerData?.panoramaUrl) return;

    // Destruir instancia previa si existe (hot reload en dev, o re-mount)
    if (viewerInstanceRef.current) {
      viewerInstanceRef.current.destroy();
      viewerInstanceRef.current = null;
    }

    const markersPlugin = MarkersPlugin.withConfig({
      markers: viewerData.markers ?? [],
    });

    const viewer = new Viewer({
      container: viewerRef.current,
      panorama: viewerData.panoramaUrl,
      adapter: EquirectangularAdapter,
      plugins: [markersPlugin],
      navbar: 'zoom move fullscreen',
      defaultZoomLvl: 50,
      mousewheel: true,
      mousemove: true,
    });

    viewerInstanceRef.current = viewer;
    const markersPluginInstance = viewer.getPlugin(MarkersPlugin);

    markersPluginInstance.addEventListener('select-marker', ({ marker }) => {
      onMarkerSelect?.(marker, markersPluginInstance);
    });

    markersPluginInstance.addEventListener('unselect-marker', () => {
      onMarkerUnselect?.();
    });

    // Hover en marcadores de tipo "text" (pointer-events none, así que usamos mousemove)
    const textMarkerIds = (viewerData.annotations ?? [])
      .filter((a) => a.type === 'text')
      .map((a) => a.id);
    const hoverClass = 'psv-marker--label-hover';

    viewer.addEventListener('ready', () => {
      if (textMarkerIds.length === 0) return;

      const updateHover = (x, y) => {
        for (const id of textMarkerIds) {
          const el = document.getElementById(`psv-marker-${id}`);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          el.classList.toggle(hoverClass, inside);
        }
      };

      document.addEventListener('mousemove', (e) => updateHover(e.clientX, e.clientY));

      viewerRef.current?.addEventListener('mouseleave', () => {
        for (const id of textMarkerIds) {
          document.getElementById(`psv-marker-${id}`)?.classList.remove(hoverClass);
        }
      });
    });

    // Cleanup: destruir el visor al desmontar el componente
    return () => {
      viewer.destroy();
      viewerInstanceRef.current = null;
    };
  }, [viewerData?.panoramaUrl]);

  return viewerRef;
}
