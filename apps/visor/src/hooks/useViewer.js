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

    // Cleanup: destruir el visor al desmontar el componente
    return () => {
      viewer.destroy();
      viewerInstanceRef.current = null;
    };
  }, [viewerData?.panoramaUrl]);

  return viewerRef;
}
