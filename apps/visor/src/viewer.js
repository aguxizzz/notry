import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';

/**
 * Crea e inicializa el visor equirrectangular con el plugin de marcadores.
 * @param {string} containerSelector - Selector CSS del contenedor (ej. '#viewer-container')
 * @param {string} panoramaUrl - URL de la imagen equirrectangular
 * @param {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]} markerConfigs - Marcadores ya en formato del plugin
 * @returns {{ viewer: import('@photo-sphere-viewer/core').Viewer, markersPlugin: MarkersPlugin }}
 */
export function createViewer(containerSelector, panoramaUrl, markerConfigs = []) {
  const markersPlugin = MarkersPlugin.withConfig({
    markers: markerConfigs,
  });

  const viewer = new Viewer({
    container: containerSelector,
    panorama: panoramaUrl,
    adapter: EquirectangularAdapter,
    plugins: [markersPlugin],
    navbar: 'zoom move fullscreen',
    defaultZoomLvl: 50,
    mousewheel: true,
    mousemove: true,
  });

  const markersPluginInstance = viewer.getPlugin(MarkersPlugin);
  return { viewer, markersPlugin: markersPluginInstance };
}
